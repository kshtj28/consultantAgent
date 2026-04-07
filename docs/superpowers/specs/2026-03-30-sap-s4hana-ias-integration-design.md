# Design Document: SAP S/4HANA & IAS Integration for ProcessIQ Discovery

**Version:** 2.0
**Date:** 2026-03-30
**Status:** Draft — Security Review Applied
**Author:** Architecture Team
**Classification:** CONFIDENTIAL
**Cloud Platform:** Microsoft Azure
**Data Residency:** Azure region MUST match customer's SAP data residency requirements (see Section 13)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Context & Actors](#2-system-context--actors)
3. [Security Architecture](#3-security-architecture)
   - 3.1 [Authentication — SAP IAS + OAuth 2.0](#31-authentication--sap-ias--oauth-20)
   - 3.2 [Authorization — RBAC Model Mapping](#32-authorization--rbac-model-mapping)
   - 3.3 [Token Lifecycle Management](#33-token-lifecycle-management)
   - 3.4 [Session Store — In-Memory Only](#34-session-store--in-memory-only)
   - 3.5 [Secret & Certificate Rotation](#35-secret--certificate-rotation)
4. [Integration Architecture](#4-integration-architecture)
   - 4.1 [Network Topology — On-Premise SAP Connectivity](#41-network-topology--on-premise-sap-connectivity)
   - 4.2 [SAP API Layer](#42-sap-api-layer)
   - 4.3 [Data Flow — Product Lifecycle Validation](#43-data-flow--product-lifecycle-validation)
5. [Data Confidentiality & Encryption](#5-data-confidentiality--encryption)
   - 5.1 [Zero-Persistence Principle](#51-zero-persistence-principle)
   - 5.2 [NoSQL Database — Encrypted Workflow State](#52-nosql-database--encrypted-workflow-state)
   - 5.3 [Encryption Architecture](#53-encryption-architecture)
6. [Workflow Approval Process](#6-workflow-approval-process)
7. [SAP-Side Configuration Steps](#7-sap-side-configuration-steps)
8. [Third-Party App Configuration Steps](#8-third-party-app-configuration-steps)
9. [Operational Concerns](#9-operational-concerns)
10. [Compliance & Audit](#10-compliance--audit)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Incident Response Plan](#12-incident-response-plan)
13. [Data Residency & Transfer](#13-data-residency--transfer)
14. [Appendix](#appendix)

---

## 1. Executive Summary

This document defines the integration architecture between **ProcessIQ Discovery** (an AI-powered workflow manager) and **SAP S/4HANA on-premise** systems, using **SAP Identity Authentication Service (IAS)** as the identity broker. The solution is hosted on **Microsoft Azure**. The integration enables:

- **Product lifecycle validation** — AI searches SAP master data, BOMs, quality standards, and regulatory norms via SAP APIs to build lifecycle validations for new products based on existing products.
- **Workflow approvals** — Multi-level RBAC-governed approval workflows with SAP role alignment.
- **Zero data storage** — SAP data is never persisted outside of encrypted, transient workflow state.

### Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Least Privilege** | Scoped OAuth tokens; SAP authorization objects restrict API access per role; separate managed identities per service |
| **Zero Persistence** | SAP data is queried in real-time, never cached or stored at rest outside active workflows |
| **Encryption Everywhere** | TLS 1.3 in transit; AES-256-GCM at rest; field-level client-side encryption for workflow DB |
| **Defense in Depth** | VNet isolation + Private Endpoints + WAF + OAuth + SAP auth objects + app-level RBAC |
| **Audit Trail** | Every SAP API call and workflow state transition is logged with non-repudiation (SAP data values redacted) |
| **Fail Closed** | All security checks fail closed — denied by default on error, timeout, or misconfiguration |
| **Trust Boundaries Acknowledged** | SAP BTP is an explicit trusted third party; documented in risk register |

### Deployment Model

This design assumes **single-tenant deployment** — one ProcessIQ instance per customer. Multi-tenant deployment requires separate Cosmos DB accounts per tenant (partition-key isolation is insufficient for HIGHLY CONFIDENTIAL SAP data). See Section 5.3 for details.

---

## 2. System Context & Actors

### 2.1 Systems

```
+-------------------------+          +-------------------------+          +----------------------------+
|   SAP S/4HANA           |          |   SAP IAS               |          |  ProcessIQ Discovery       |
|   (On-Premise)          |  <---->  |   (Cloud Identity       |  <---->  |  (Third-Party AI Workflow  |
|                         |          |    Broker)              |          |   Manager — Azure Hosted)  |
|  - Material Master      |          |  - OAuth 2.0 Server     |          |  - AI Lifecycle Engine     |
|  - BOM/Routing          |          |  - SAML 2.0 IdP/SP     |          |  - RBAC Workflow Approvals |
|  - Quality Management   |          |  - User Provisioning    |          |  - Encrypted NoSQL State   |
|  - PLM/Recipe Dev       |          |  - MFA Enforcement      |          |  - Zero-Persistence Layer  |
|  - Regulatory Compliance|          |  - Risk-Based Auth      |          |  - Audit Logger            |
+-------------------------+          +-------------------------+          +----------------------------+
         |                                      |                                     |
         |              +-------------------+   |                                     |
         +--------------| SAP Cloud         |---+                                     |
                        | Connector (SCC)   |<-----------------------------------------+
                        | (Reverse Proxy)   |
                        +-------------------+
```

**Trust Boundary Note:** SAP BTP Destination Service terminates TLS and can observe SAP API traffic (request/response payloads) in transit. This is an accepted trust dependency — SAP is already the data owner. ProcessIQ treats BTP as a trusted intermediary, not a transparent proxy.

### 2.2 Actors & Roles

| Actor | SAP Role | ProcessIQ RBAC Role | Permissions |
|-------|----------|---------------------|-------------|
| Product Engineer | `Z_PLM_ENGINEER` | `workflow_initiator` | Create lifecycle validation requests; view product master data |
| Quality Manager | `Z_QM_MANAGER` | `workflow_approver_l1` | Approve/reject L1 validations; view quality norms |
| Regulatory Lead | `Z_REG_LEAD` | `workflow_approver_l2` | Approve/reject L2 compliance checks; view regulatory standards |
| Plant Manager | `Z_PLANT_MGR` | `workflow_approver_l3` | Final approval; view all product data for assigned plant |
| System Admin | `SAP_ALL` (restricted) | `admin` | Configure integration; manage role mappings; view audit logs |
| AI Engine | Technical User (RFC) | `system_service` | Read-only SAP API access; no approval authority |

---

## 3. Security Architecture

### 3.1 Authentication — SAP IAS + OAuth 2.0

#### Authentication Flow: Authorization Code with PKCE

This flow is used for interactive user authentication. PKCE (Proof Key for Code Exchange) is mandatory to prevent authorization code interception attacks.

```
                                    ProcessIQ Discovery
User (Browser)                      (Third-Party App)                SAP IAS                    SAP S/4HANA
     |                                    |                            |                            |
     |  1. Access app                     |                            |                            |
     |----------------------------------->|                            |                            |
     |                                    |                            |                            |
     |  2. Generate code_verifier +       |                            |                            |
     |     code_challenge (SHA-256)       |                            |                            |
     |                                    |                            |                            |
     |  3. Redirect to IAS /authorize     |                            |                            |
     |     + code_challenge               |                            |                            |
     |<-----------------------------------|                            |                            |
     |                                    |                            |                            |
     |  4. User authenticates (+ MFA)     |                            |                            |
     |--------------------------------------------------------------->|                            |
     |                                    |                            |                            |
     |  5. IAS validates credentials      |                            |                            |
     |     + enforces risk-based auth     |                            |                            |
     |                                    |                            |                            |
     |  6. Authorization code redirect    |                            |                            |
     |<---------------------------------------------------------------|                            |
     |                                    |                            |                            |
     |  7. Code forwarded to backend      |                            |                            |
     |----------------------------------->|                            |                            |
     |                                    |                            |                            |
     |                                    |  8. POST /oauth2/token     |                            |
     |                                    |     + code + code_verifier |                            |
     |                                    |--------------------------->|                            |
     |                                    |                            |                            |
     |                                    |  9. Access Token (JWT)     |                            |
     |                                    |     + Refresh Token        |                            |
     |                                    |     + id_token (OIDC)      |                            |
     |                                    |<---------------------------|                            |
     |                                    |                            |                            |
     |                                    | 10. Call SAP API           |                            |
     |                                    |     Bearer <access_token>  |                            |
     |                                    |     via Cloud Connector    |                            |
     |                                    |--------------------------------------------------------------->|
     |                                    |                            |                            |
     |                                    | 11. SAP validates token    |                            |
     |                                    |     + checks auth objects  |                            |
     |                                    |<---------------------------------------------------------------|
     |                                    |                            |                            |
     | 12. Render results (no persist)    |                            |                            |
     |<-----------------------------------|                            |                            |
```

#### Service-to-Service Authentication (AI Engine)

For the AI engine's background SAP data queries, use **Client Credentials** flow with a dedicated technical user:

```
ProcessIQ AI Engine              SAP IAS                          SAP S/4HANA
     |                              |                                  |
     | 1. POST /oauth2/token        |                                  |
     |    grant_type=client_creds   |                                  |
     |    + client_id + secret      |                                  |
     |    + scope=api.read          |                                  |
     |----------------------------->|                                  |
     |                              |                                  |
     | 2. Access Token (short-lived |                                  |
     |    5 min TTL, read-only)     |                                  |
     |<-----------------------------|                                  |
     |                              |                                  |
     | 3. GET /sap/opu/odata/...    |                                  |
     |    Bearer <token>            |                                  |
     |    via Cloud Connector       |                                  |
     |------------------------------------------------------------>|
     |                              |                                  |
     | 4. Response (streamed,       |                                  |
     |    not persisted)            |                                  |
     |<------------------------------------------------------------|
```

**Token introspection is NOT used per-call** for the AI engine — the 5-minute TTL makes it unnecessary. The engine re-acquires a fresh token via Client Credentials before each batch of SAP queries. Stale tokens are discarded, never reused.

**Approval actions by human users require fresh authentication at the time of action.** Tokens are NOT stored in workflow state — each approver must have an active, valid session when they approve/reject. The workflow records `principalId` and `approvalTimestamp` but never the token.

#### IAS Configuration Requirements

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Application Type | OpenID Connect | Modern standard; JWT tokens for stateless validation |
| Grant Types | Authorization Code + PKCE, Client Credentials | User-interactive + machine-to-machine |
| Token Lifetime — Access | 300 seconds (5 min) | Minimize exposure window for SAP data access |
| Token Lifetime — Refresh | 3600 seconds (1 hr) | Session continuity without re-authentication |
| MFA Policy | TOTP or FIDO2, enforced for all users | Protect against credential theft; no SMS (SIM-swap risk) |
| Risk-Based Auth | Enabled — triggers step-up for: new device, new location, impossible travel | Adaptive security |
| IP Restrictions | Restrict token endpoint to ProcessIQ NAT Gateway static public IP only | Prevent token acquisition from unauthorized origins (see Section 4.1 for static IP requirement) |
| CORS | Allowed origins: ProcessIQ frontend domain only; `withCredentials: true` required for `SameSite=Strict` cookies | Prevent cross-origin abuse |
| Subject Name Identifier | `user_uuid` (not email) | Stable identifier; email changes should not break mapping |

### 3.2 Authorization — RBAC Model Mapping

#### SAP Authorization Objects to ProcessIQ RBAC

The integration maps SAP authorization objects to ProcessIQ RBAC permissions at token exchange time. Claims are embedded in the JWT by IAS via custom attributes.

```
SAP Authorization Objects              IAS Custom Claims              ProcessIQ RBAC
+---------------------------+     +---------------------------+     +---------------------------+
| M_MATE_WRK (Plant)       |     | sap_plant: ["1000","2000"]|     | resource.plant = [...]    |
| M_MATE_MAR (Mat. Group)  | --> | sap_matgrp: ["FERT"]      | --> | resource.material_group   |
| Q_QMEL (Quality Notif.)  |     | sap_qm: true              |     | permission.quality.read   |
| C_AFKO_DIS (Prod. Order) |     | sap_prod_order: "display" |     | permission.bom.read       |
+---------------------------+     +---------------------------+     +---------------------------+
```

#### RBAC Enforcement Matrix

| ProcessIQ Permission | SAP Scope Required | Workflow Action | Data Accessible |
|----------------------|--------------------|-----------------|-----------------|
| `product.search` | `API_PRODUCT_SRV.read` | Query material master | Material number, description, group, plant |
| `bom.read` | `API_BILLOFMATERIAL_SRV.read` | Query BOM structures | BOM header, items, components |
| `quality.read` | `API_QUALITYINSPECTION_SRV.read` | Query quality norms | Inspection plans, results, certificates |
| `recipe.read` | `API_RECIPE_SRV.read` (if PLM enabled) | Query recipe/formulations | Recipe header, operations, phases |
| `workflow.create` | Composite: `product.search` + `bom.read` | Initiate lifecycle validation | All read data for assigned plant |
| `workflow.approve.l1` | `quality.read` | Quality approval step | Quality norms for the product |
| `workflow.approve.l2` | `quality.read` + regulatory scope | Regulatory approval step | Regulatory compliance data |
| `workflow.approve.l3` | All read scopes for plant | Final plant approval | Full product lifecycle data |
| `audit.read` | `admin` role only | View audit trail | Workflow history, access logs |

#### Scope Enforcement — Defense in Depth

Permissions are enforced at **three layers**:

1. **SAP Layer** — Authorization objects restrict what the technical/user token can access from SAP APIs (enforced by SAP Gateway).
2. **IAS Layer** — Custom scopes in JWT limit which ProcessIQ features the token grants access to.
3. **ProcessIQ Layer** — Application RBAC validates JWT claims against workflow step requirements before executing any action.

If any layer denies, the request fails. No layer trusts another blindly.

#### Application-Level Rate Limiting

| Resource | Limit | Per | Action on Breach |
|----------|-------|-----|------------------|
| SAP API calls | 100 requests | per user per minute | HTTP 429; alert if sustained |
| Workflow creation | 10 requests | per user per hour | HTTP 429; log anomaly |
| Token refresh attempts | 5 attempts | per session per 5 min | Lock session; require re-auth |
| AI inference requests | 20 requests | per user per hour | HTTP 429; queue overflow alert |
| Approval actions | 50 actions | per user per hour | HTTP 429; flag for review |

### 3.3 Token Lifecycle Management

```
+-------------------+        +-------------------+        +-------------------+
| Token Acquired    |  --->  | Token In Use      |  --->  | Token Expired     |
| (stored in-memory |        | (attached to each |        | (refresh or       |
|  only, never disk)|        |  SAP API call)    |        |  re-authenticate) |
+-------------------+        +-------------------+        +-------------------+
         |                            |                            |
         |  Validation on every use:  |                            |
         |  - Signature (RS256)       |                            |
         |  - Expiry (exp claim)      |                            |
         |  - Issuer (iss = IAS URL)  |                            |
         |  - Audience (aud = app)    |                            |
         |  - Scope (scp claim)       |                            |
         +----------------------------+                            |
                                                                   |
                                                    Refresh Token Flow:
                                                    - POST /oauth2/token
                                                    - grant_type=refresh_token
                                                    - Rotate refresh token (one-time use)
                                                    - If refresh fails → full re-auth
```

**Critical rules:**
- Access tokens are NEVER written to disk, database, or logs.
- Tokens are held in the in-memory session store (see Section 3.4) and discarded on session end.
- Refresh tokens are single-use (rotation enabled in IAS).
- Workflow state in Cosmos DB records `principalId` and `approvalTimestamp` but NEVER stores tokens.

### 3.4 Session Store — In-Memory Only

The session store technology is **Azure Cache for Redis (Premium tier)** configured as follows:

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Persistence** | Disabled (no AOF, no RDB snapshots) | Zero-persistence requirement; tokens must never touch disk |
| **Eviction Policy** | `volatile-lru` | Evict least-recently-used sessions with TTL first |
| **Maxmemory** | 80% of instance memory | Prevent OOM; evict before full |
| **TLS** | Enforced (min TLS 1.2) | Encrypt token data in transit to Redis |
| **Network** | VNet-integrated via Private Endpoint; no public endpoint | Redis not reachable from outside VNet |
| **Authentication** | Microsoft Entra ID (managed identity) | No Redis password to manage or leak |
| **Data stored** | Encrypted session ID → { access_token, refresh_token, JWT claims, session metadata } | Tokens exist only in Redis memory |
| **Session cookie** | `HttpOnly`, `Secure`, `SameSite=Strict`, signed with HMAC | Browser cannot read cookie value; CSRF protected |
| **Session TTL** | 3600 seconds (matches refresh token lifetime) | Session auto-expires with refresh token |

**On session end or logout:** All session data is explicitly deleted from Redis (`DEL session:<id>`).

**On Redis eviction or restart:** Sessions are lost — users must re-authenticate. This is the correct behavior for a zero-persistence session store.

### 3.5 Secret & Certificate Rotation

#### IAS Client Secret Rotation

| Parameter | Value |
|-----------|-------|
| **Rotation schedule** | Every 90 days (30 days recommended for highest sensitivity) |
| **Procedure** | Zero-downtime dual-secret: (1) Generate new secret in IAS; (2) Store new secret as new version in Key Vault; (3) Application detects new version via Event Grid subscription → reloads secret without pod restart; (4) Validate new secret works; (5) Revoke old secret in IAS after 24-hour grace period |
| **IAS dual-secret support** | IAS supports multiple active client secrets simultaneously during rotation window |
| **Automation** | Azure Event Grid event on Key Vault secret version change triggers Azure Function that validates the new credential and alerts on failure |
| **Emergency rotation** | On suspected compromise: immediately revoke old secret in IAS, generate new, restart all pods |

#### Cloud Connector X.509 Certificate Lifecycle

| Parameter | Value |
|-----------|-------|
| **Issuer** | Customer's internal PKI (enterprise CA), NOT self-signed |
| **Validity** | 1 year maximum |
| **Renewal** | 30 days before expiry; automated alert at 60 days, 30 days, 7 days |
| **Renewal procedure** | (1) Generate new CSR on SCC; (2) Sign with internal CA; (3) Import to SCC; (4) Update SAP `STRUST` with new certificate; (5) Update BTP Destination trusted CA; (6) Validate principal propagation end-to-end; (7) Remove old certificate |
| **On expiry without renewal** | SCC MUST fail closed — principal propagation fails, all SAP API calls return HTTP 401. No fallback to technical user |
| **IAS SAML signing cert rotation** | SAP rotates IAS signing certificates periodically. SAP S/4HANA `STRUST` must be updated with the new certificate. Add IAS certificate expiry to monitoring dashboard; quarterly review of `STRUST` trust store |

#### Principal Propagation Failure Behavior

**CRITICAL RULE:** If principal propagation fails for any reason (certificate expiry, SCC misconfiguration, SAML assertion validation failure), the request MUST fail with HTTP 401/403. The system MUST NEVER fall back to the technical communication user. This is enforced by:

1. BTP Destination configured with `Authentication: PrincipalPropagation` (not `OAuth2SAMLBearerAssertion` with fallback).
2. SAP Gateway authorization check verifying the calling user is NOT the technical user for any OData service call triggered by a user workflow.
3. Integration test suite includes a test case that deliberately breaks principal propagation and verifies the request fails (not succeeds as technical user).

---

## 4. Integration Architecture

### 4.1 Network Topology — On-Premise SAP Connectivity

Since SAP S/4HANA is on-premise, a secure tunnel is required. **SAP Cloud Connector (SCC)** provides this.

```
+------------------------------------------------------+       +-------------------------------------------+
|  Azure Cloud (ProcessIQ Hosting)                     |       |  Customer On-Premise Network               |
|  Region: <customer-specified, matching data residency>|       |                                           |
|                                                      |       |                                           |
|  +-- Azure VNet (10.0.0.0/16) ---------------------+ |       |                                           |
|  |                                                  | |       |                                           |
|  |  +-- Subnet: compute (10.0.1.0/24) ----------+  | |       |                                           |
|  |  | ProcessIQ Backend (ACA/AKS)               |  | |       |                                           |
|  |  |  - Auth Service     [MI: auth-identity]   |  | |       |                                           |
|  |  |  - Workflow Service  [MI: workflow-identity]|  | |       |                                           |
|  |  |  - AI Engine         [MI: ai-identity]    |  | |       |                                           |
|  |  +-------------------------------------------+  | |       |                                           |
|  |       |              |             |             | |       |                                           |
|  |  +-- Subnet: data (10.0.2.0/24) -------------+  | |       |                                           |
|  |  | [PE] Azure Cosmos DB (Private Endpoint)    |  | |       |                                           |
|  |  | [PE] Azure Key Vault (Private Endpoint)    |  | |       |                                           |
|  |  | [PE] Azure Cache for Redis (Private EP)    |  | |       |                                           |
|  |  +-------------------------------------------+  | |       |                                           |
|  |       |                                          | |       |                                           |
|  |  +-- NAT Gateway (Static Public IP) ---------+  | |       |                                           |
|  |  | PIP: 20.x.x.x (registered in IAS          |  | |       |                                           |
|  |  |      IP allowlist for token endpoint)      |  | |       |                                           |
|  |  +-------------------------------------------+  | |       |                                           |
|  |       |                                          | |       |                                           |
|  |  +-- Azure App Gateway + WAF v2 -------------+  | |       |                                           |
|  |  | OWASP CRS 3.2 (Prevention mode)           |  | |       |                                           |
|  |  | Custom rules: OData injection, rate limit  |  | |       |                                           |
|  |  +-------------------------------------------+  | |       |                                           |
|  +--------------------------------------------------+ |       |                                           |
|                     |                                  |       |                                           |
|                     | (outbound via NAT GW)            |       |                                           |
|                     v                                  |       |                                           |
|            SAP BTP Destination Service  ===============|=====  |                                           |
|            (Trusted Third Party — TLS   |  TLS 1.3    |       | +------------------+   +----------------+ |
|             terminated at BTP; SAP can  |  Tunnel     |       | | SAP Cloud        |   | SAP S/4HANA    | |
|             observe request/response    |             |       | | Connector (SCC)  |-->| System         | |
|             payloads in transit)        |             |       | | (Reverse Invoke) |   |                | |
|                                         ===============|=====  | | - Access Control |   | - OData APIs   | |
|                                                        |       | | - URL Mapping    |   | - RFC/BAPI     | |
|                                                        |       | | - Principal Prop.|   | - Auth Objects  | |
|                                                        |       | +------------------+   +----------------+ |
|                                                        |       |         |                                  |
|                                                        |       | +------------------+                       |
|                                                        |       | | Corporate        |                       |
|                                                        |       | | Firewall         |                       |
|                                                        |       | | (Outbound :443   |                       |
|                                                        |       | |  only to BTP)    |                       |
|                                                        |       | +------------------+                       |
+--------------------------------------------------------+       +-------------------------------------------+
```

**Key network security controls:**
- **All data-plane services** (Cosmos DB, Key Vault, Redis) are accessible ONLY via Private Endpoints inside the VNet. Public network access is **disabled** on all three.
- **NAT Gateway with static public IP** ensures IAS IP allowlist is stable across pod restarts and scale-out events.
- **Azure Application Gateway with WAF v2** in Prevention mode using OWASP Core Rule Set 3.2, plus custom rules for OData-specific attack patterns (`$filter` injection, excessive `$expand` depth, SSRF via query parameters).
- **IMDS protection:** On AKS, Network Policy blocks pod access to Azure Instance Metadata Service (`169.254.169.254`) except for pods that explicitly require managed identity tokens. On ACA, IMDS is not directly exposed.

#### SAP Cloud Connector Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Protocol** | HTTPS | Mandatory for all API traffic |
| **Virtual Host** | `s4hana-virtual.processiq.internal` | Exposed to BTP; maps to real SAP host |
| **Virtual Port** | 443 | |
| **Internal Host** | `sap-s4.customer.corp` | Actual S/4HANA hostname |
| **Internal Port** | 8443 (ICM HTTPS) | SAP ICM HTTPS port |
| **Principal Propagation** | Enabled (X.509 from internal CA — see Section 3.5) | End-user identity flows through to SAP; fails closed on error |
| **URL Path Prefixes** | `/sap/opu/odata/sap/` (allowlist — see Section 4.2 for exact paths) | Restrict to OData services only — no RFC, no GUI |
| **Access Policy** | Specific paths only (no wildcard) | Each OData service is explicitly registered |
| **Audit Logging** | Enabled | All tunnel traffic is logged |
| **mTLS** | Enforced on ProcessIQ → BTP Destination leg | ProcessIQ presents client certificate; BTP validates against trusted CA |

#### Why SAP Cloud Connector (Not VPN/ExpressRoute)

| Criterion | SAP Cloud Connector | VPN / Azure ExpressRoute |
|-----------|---------------------|--------------------------|
| Direction | Outbound-only from on-prem (no inbound firewall rules needed) | Requires inbound rules or dedicated circuit |
| Granularity | URL-path-level access control | Network-level only |
| Principal Propagation | Native SAP support | Requires custom solution |
| SAP Support | Fully supported integration path | Best-effort |
| Cost | Included with BTP subscription | Additional Azure/network cost + ExpressRoute circuit fees |

### 4.2 SAP API Layer

#### OData Services Used

Each service path below is explicitly registered in the SCC allowlist — no wildcards.

| SAP OData Service | SCC Registered Path | Purpose | Data Retrieved |
|-------------------|---------------------|---------|----------------|
| `API_PRODUCT_SRV` | `/sap/opu/odata/sap/API_PRODUCT_SRV/` | Material master data | Material number, description, material group, base UoM, plant assignment |
| `API_BILLOFMATERIAL_SRV` | `/sap/opu/odata/sap/API_BILLOFMATERIAL_SRV/` | Bill of Materials | BOM header, items, components, quantities |
| `API_RECIPE_SRV` | `/sap/opu/odata/sap/API_RECIPE_SRV/` | Recipe/Process management | Master recipe, operations, phases, parameters |
| `API_QUALITYINSPECTION_SRV` | `/sap/opu/odata/sap/API_QUALITYINSPECTION_SRV/` | Quality inspection plans | Inspection lots, results, characteristics, usage decisions |
| `API_REGULATORYCOMPLIANCE` | `/sap/opu/odata/sap/API_REGULATORYCOMPLIANCE/` | Regulatory data | Substance volumes, compliance status, regulatory lists |
| `API_CHARCVALUE_ASSIGNMENT_SRV` | `/sap/opu/odata/sap/API_CHARCVALUE_ASSIGNMENT_SRV/` | Classification & characteristics | Material characteristics, class assignments |

**Write-back path (optional):** If the optional SAP write-back is enabled (see Section 4.3 Step 6), a custom Z-service must be separately designed with its own security specification — including: separate scoped token, dedicated SCC path registration (`/sap/opu/odata/sap/Z_PROCESSIQ_STATUS_SRV/`), SAP-side input validation, and a write-specific authorization role distinct from the read role. **This is out of scope for this document and must be a separate design artifact.**

#### API Call Patterns

```
# Pattern 1: Product Search (AI Engine queries SAP)
GET /sap/opu/odata/sap/API_PRODUCT_SRV/A_Product
  ?$filter=MaterialGroup eq 'FERT' and Plant eq '1000'
  &$select=Material,MaterialDescription,MaterialGroup
  &$top=100
  Authorization: Bearer <token>
  Accept: application/json

# Pattern 2: BOM Retrieval for lifecycle comparison
GET /sap/opu/odata/sap/API_BILLOFMATERIAL_SRV/MaterialBOM
  ?$filter=Material eq 'FG-001' and Plant eq '1000'
  &$expand=to_BOMItem
  Authorization: Bearer <token>

# Pattern 3: Quality norms for validation
GET /sap/opu/odata/sap/API_QUALITYINSPECTION_SRV/InspectionLot
  ?$filter=Material eq 'FG-001'
  &$expand=to_InspectionResult
  Authorization: Bearer <token>
```

**Important:** All responses are read into server-side memory, processed by the AI engine, and NEVER persisted to disk. See [Section 5.1](#51-zero-persistence-principle). Note: "streaming" here means the full JSON response body is held in RAM only — OData APIs return complete JSON responses, not binary streams. The AI inference model (Ollama) requires the full prompt context in memory simultaneously. The protection is RAM-only residency with short process lifetime, not incremental streaming.

### 4.3 Data Flow — Product Lifecycle Validation

```
Step 1: User initiates "New Product Lifecycle Validation" in ProcessIQ
        → Provides: new product concept, target plant, product category

Step 2: AI Engine queries SAP for existing reference products
        → API_PRODUCT_SRV: similar materials in same group/plant
        → API_BILLOFMATERIAL_SRV: BOM structures of reference products
        → API_RECIPE_SRV: manufacturing process of reference products

Step 3: AI Engine queries SAP for standards & norms
        → API_QUALITYINSPECTION_SRV: quality inspection plans for the category
        → API_REGULATORYCOMPLIANCE: regulatory requirements for substances
        → API_CHARCVALUE_ASSIGNMENT_SRV: required characteristics/specs

Step 4: AI Engine builds lifecycle validation report (in-memory)
        → Compares new product concept against reference products
        → Identifies: missing quality specs, regulatory gaps, BOM risks
        → Generates: validation checklist, risk score, recommendations

Step 5: Validation report enters workflow for approval
        → Encrypted workflow state stored in Azure Cosmos DB (see Section 5.2)
        → SAP data fragments in report are field-level encrypted
        → Approval chain: L1 (Quality) → L2 (Regulatory) → L3 (Plant Mgr)

Step 6: On final approval
        → Mark workflow as completed
        → TTL set on the completed document (72h auto-purge)
        → Optional: Write-back to SAP (OUT OF SCOPE — separate design required)
```

---

## 5. Data Confidentiality & Encryption

### 5.1 Zero-Persistence Principle

SAP data is classified as **HIGHLY CONFIDENTIAL**. The following rules are absolute:

| Rule | Enforcement |
|------|-------------|
| SAP API responses are NEVER written to disk | Application code review + runtime file-system audit |
| SAP data is NEVER logged (not even at DEBUG level) | Structured logging with SAP-field blocklist; log scrubber applied to ALL log fields including `queryFilters` |
| SAP data is NEVER sent to external AI providers | AI inference runs on self-hosted Ollama (GPU tier) within the VNet; no data leaves VNet except via SCC/BTP tunnel to SAP itself |
| SAP data in workflow state is field-level encrypted | AES-256-GCM with per-document DEKs via Azure Key Vault |
| Workflow records have a mandatory TTL | Cosmos DB TTL: 72 hours after workflow reaches terminal state (completed/cancelled) |
| Memory residency is time-bounded | Ephemeral container lifecycle; GC-triggered cleanup on request completion |

**Secure memory wipe limitation:** ProcessIQ runs on Node.js (garbage-collected runtime). `explicit_bzero()` and deterministic memory wipe are NOT reliably achievable in V8 — the GC may copy or move objects before wiping. The primary protection is: (1) short-lived container processes, (2) RAM-only residency (no disk), (3) encrypted-at-rest for any persistence, and (4) VNet isolation preventing exfiltration. For the highest-sensitivity data processing path (raw SAP API responses → AI inference), a future enhancement may introduce a Rust sidecar with deterministic memory control communicating via Unix socket.

#### Data Classification Tags

Every data element from SAP is tagged in-memory:

```typescript
interface SAPDataEnvelope<T> {
  classification: 'SAP_CONFIDENTIAL';
  source: string;          // e.g., 'API_PRODUCT_SRV'
  retrievedAt: ISO8601;    // timestamp
  ttlSeconds: number;      // max time this data may exist in memory
  principal: string;       // user_uuid who authorized retrieval
  data: T;                 // actual payload — encrypted before any persistence
}
```

### 5.2 NoSQL Database — Encrypted Workflow State

#### Why Azure Cosmos DB (NoSQL API) — Provisioned Autoscale Mode

| Requirement | Cosmos DB Capability |
|-------------|----------------------|
| NoSQL | Native document store with flexible schema (NoSQL API) |
| Encryption at rest | Always-on with Microsoft-managed keys or customer-managed keys (CMK) via Azure Key Vault |
| On-the-fly decryption with low latency | Transparent server-side decryption — single-digit ms reads with guaranteed SLAs |
| Field-level encryption | Client-side encryption via custom AES-256-GCM with Key Vault DEK/KEK envelope encryption |
| TTL-based auto-purge | Native per-item TTL — documents auto-deleted after expiry |
| Throughput control | Provisioned autoscale with defined max RU/s ceiling prevents runaway cost and provides guaranteed throughput |
| Global distribution | Multi-region writes with guaranteed consistency levels (if needed) |
| SLA | 99.999% with multi-region; 99.99% single region |

**Capacity mode: Provisioned Autoscale** (NOT serverless). Serverless mode has a hard 5,000 RU/s per-container ceiling that could silently stall workflow state transitions under load. Provisioned autoscale with a configurable max RU/s (e.g., 10,000 RU/s) provides predictable throughput with cost protection. An Azure Budget Alert is configured for Cosmos DB cost anomalies exceeding 150% of baseline.

#### Alternative Considered: MongoDB Atlas with CSFLE

| Criterion | Cosmos DB + Client Encryption | MongoDB Atlas + CSFLE |
|-----------|-------------------------------|------------------------|
| Latency (encrypted read) | 1-5 ms (single-digit, SLA-backed) | 5-15 ms (queryable encryption adds overhead) |
| Client-side encryption | Custom AES-256-GCM with Azure Key Vault | MongoDB CSFLE / Queryable Encryption |
| Key management | Azure Key Vault (native) | Azure KV / AWS KMS / GCP KMS |
| Auto-purge (TTL) | Native Cosmos DB per-item TTL | Native MongoDB TTL Index |
| Operational burden | Low (autoscale provisioned) | Moderate (cluster management) |
| Cost at scale | Autoscale with ceiling; predictable | Cluster cost even when idle |
| Azure ecosystem fit | Native (already using ACA/AKS, App Gateway) | External dependency |
| SLA | 99.999% with multi-region | 99.995% |

**Decision:** Azure Cosmos DB (NoSQL API) with client-side field-level encryption via Azure Key Vault. Lower latency, SLA-backed, native Azure integration.

### 5.3 Encryption Architecture

```
+---------------------------------------------------+
|  Application Layer (ProcessIQ Backend)             |
|                                                    |
|  +---------------------------------------------+  |
|  | Client-Side Encryption Module                |  |
|  | (AES-256-GCM via Azure Key Vault)            |  |
|  |                                              |  |
|  | Plaintext field ──► Encrypt (AES-256-GCM)    |  |
|  |   - Generate random DEK per document         |  |
|  |   - Wrap DEK with KEK via Key Vault          |  |
|  |   - DEK held ONLY for current request scope  |  |
|  |   - DEK discarded after request completes    |  |
|  |                                              |  |
|  | Encrypted field ──► Decrypt                   |  |
|  |   - Unwrap DEK via Key Vault                 |  |
|  |   - DEK held ONLY for current request scope  |  |
|  |   - AES-256-GCM decrypt field                |  |
|  |   - On KEK revocation: unwrap fails → hard   |  |
|  |     error, no fallback                        |  |
|  +---------------------------------------------+  |
|                        |                           |
+------------------------|---------------------------+
                         v
          +-------------------------------+
          |  Azure Cosmos DB (NoSQL API)  |
          |  [Private Endpoint only]      |
          |                               |
          |  Container: workflow-state     |
          |  +-------------------------+  |
          |  | id: <UUID v4>           |  |  <-- cryptographically random
          |  | workflowId: <UUID v4>   |  |  <-- cryptographically random (not sequential)
          |  | stepId: "step-001"      |  |
          |  | tenantId: "cust-001"    |  |  <-- partition key (single-tenant deployment)
          |  | status: "pending"       |  |  <-- unencrypted (queryable)
          |  | assignedTo: <HMAC>      |  |  <-- HMAC(user_uuid, tenant_key) — queryable
          |  |                         |  |      but not reversible without tenant key
          |  | sapData: <encrypted>    |  |  <-- AES-256-GCM client-side encrypted
          |  | aiAnalysis: <encrypted> |  |  <-- AES-256-GCM client-side encrypted
          |  | validations: <encrypted>|  |  <-- AES-256-GCM client-side encrypted
          |  | approverComments: <enc> |  |  <-- AES-256-GCM client-side encrypted
          |  | wrappedDEK: <blob>      |  |  <-- KEK-wrapped DEK for this document
          |  | ttl: null | 259200     |  |  <-- null while active; set on terminal state
          |  | _ts: 1711900800        |  |  <-- Cosmos DB system timestamp
          |  | createdAt: ISO8601      |  |
          |  | _etag: "0800..."       |  |  <-- optimistic concurrency (mandatory)
          |  +-------------------------+  |
          |                               |
          |  Encryption at rest:          |  <-- double encryption
          |  Azure Key Vault CMK          |  <-- (client-side + server-side)
          |  (always-on, transparent)     |
          |  Public network access: OFF   |
          +-------------------------------+
                         |
                         v
          +-------------------------------+
          |  Azure Key Vault              |
          |  [Private Endpoint only]      |
          |  Public network access: OFF   |
          |                               |
          |  Key: processiq-workflow-kek  |
          |  (Key Encryption Key, RSA-2048)|
          |  - Auto key rotation: ON      |
          |  - Soft delete: ON            |
          |  - Purge protection: ON       |
          |  - Diagnostic logging: ON     |
          |                               |
          |  Secret: processiq-sap-creds  |
          |  (IAS client ID + secret)     |
          +-------------------------------+
```

#### Cosmos DB Container Schema

```
Database: processiq-workflows
Container: workflow-state
  Partition Key: /tenantId (String — single-tenant; multi-tenant requires separate accounts)
  Unique Key Policy: /workflowId + /stepId

Composite Index: (assignedTo ASC, status ASC)
Composite Index: (workflowType ASC, createdAt DESC)

TTL: Enabled at container level
  - Active workflows: ttl = null (no expiry while in progress)
  - Terminal states (completed, cancelled, permanently rejected): ttl = 259200 (72 hours)
  - Maximum absolute TTL: 2592000 (30 days) set on creation as a safety net
    for workflows stuck in non-terminal states

Encrypted Fields (via client-side AES-256-GCM):
  - sapData, aiAnalysis, validations, approverComments

HMAC Fields (queryable but not reversible):
  - assignedTo: HMAC-SHA256(user_uuid, tenant_scoped_key)

Unencrypted Fields (queryable):
  - id, workflowId, stepId, tenantId, status, createdAt, workflowType

Concurrency Control: Cosmos DB _etag (optimistic concurrency — MANDATORY for all writes)

ID Generation: All workflowId values are UUID v4 (128-bit cryptographically random)
```

#### DEK Lifecycle — Request-Scoped Only

```
Request starts
  → Unwrap DEK from wrappedDEK field via Key Vault
  → Hold DEK in local variable (request scope)
  → Decrypt fields
  → Process request
  → Re-encrypt modified fields with same or new DEK
  → Wrap new DEK via Key Vault → store wrappedDEK
  → DEK variable goes out of scope → eligible for GC
Request ends
  → No DEK remains in memory beyond request lifecycle

On KEK revocation in Key Vault:
  → Next unwrap call fails immediately → HTTP 500 to client
  → No cached DEK can serve stale decryption
  → This is intentional fail-closed behavior
```

#### Key Hierarchy

```
Azure Key Vault KEK (processiq-workflow-kek, RSA-2048)
  └── Data Encryption Key (DEK, unique per Cosmos DB document)
        └── DEK is wrapped (encrypted) by KEK and stored alongside document
              └── AES-256-GCM encrypts each sensitive field using unwrapped DEK
                    └── Encryption context binds key to {workflowId, stepId, fieldName}
                          └── Prevents ciphertext from being moved between documents
```

#### Key Vault Access Control — Separate Managed Identities

```
Auth Service Managed Identity (auth-identity)
  ├── Key Vault Secrets User: YES   (can read IAS credentials)
  ├── Key Vault Crypto User: NO     (cannot touch encryption keys)
  └── Cosmos DB: NO access

Workflow Service Managed Identity (workflow-identity)
  ├── Key Vault Crypto User: YES    (can wrap/unwrap DEKs)
  ├── Key Vault Secrets User: NO    (cannot read IAS credentials)
  └── Cosmos DB: Data Contributor   (read/write workflow state)

AI Engine Managed Identity (ai-identity)
  ├── Key Vault Crypto User: YES    (can wrap/unwrap DEKs for storing analysis)
  ├── Key Vault Secrets User: NO    (cannot read IAS credentials)
  └── Cosmos DB: Data Contributor   (read/write workflow state)

Platform Admin (Azure AD Group)
  ├── Key Vault Administrator: YES  (key rotation, policy management)
  ├── Key Vault Crypto User: NO     (cannot decrypt workflow data)
  └── Cosmos DB: NO data plane access

Separation of Duties: No single identity can both manage keys AND decrypt data.
                      No single identity can both read IAS secrets AND access workflow data.
```

---

## 6. Workflow Approval Process

### 6.1 Lifecycle Validation Workflow

```
                    ┌──────────────┐
                    │   INITIATE   │ Product Engineer creates
                    │   Validation │ lifecycle validation request
                    └──────┬───────┘
                           │
                           v
                    ┌──────────────┐
                    │   AI ENGINE  │ Queries SAP APIs → builds
                    │   ANALYSIS   │ validation report (in-memory)
                    └──────┬───────┘
                           │
                           v
                    ┌──────────────┐
                    │  ENCRYPT &   │ Report encrypted → stored
                    │  STORE STATE │ in Cosmos DB (ttl=null)
                    └──────┬───────┘     + absolute max TTL (30 days)
                           │
              ┌────────────┼────────────┐
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ L1: QM   │ │ L2: REG  │ │ L3: PLANT│
        │ Approval │→│ Approval │→│ Approval │  Sequential approval
        │ (Quality │ │ (Regulat │ │ (Final   │  chain
        │  Manager)│ │  Lead)   │ │  Sign-off│
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
        ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
        │Approve/ │  │Approve/ │  │Approve/ │
        │Reject/  │  │Reject/  │  │Reject/  │
        │Escalate │  │Escalate │  │Escalate │
        └────┬────┘  └─────────┘  └────┬────┘
             │                         │
             │    On Reject:           │    On Final Approve:
             │    → Return to          │    → Set status=completed
             │      initiator with     │    → Set ttl=259200 (72h)
             │      comments           │    → Optional: write-back
             │    → ttl remains null   │      (separate design)
             │      (workflow still    │    → Auto-purge after TTL
             │       active)           │
             v                         v
        ┌──────────┐           ┌──────────────┐
        │ REVISION │           │  COMPLETED   │
        │ (re-enter│           │  (auto-purge │
        │  at L1)  │           │   after TTL) │
        └──────────┘           └──────────────┘
```

**TTL rules:**
- **Active workflows** (pending, in-review, revision): `ttl = null` (no auto-deletion while work is in progress).
- **Terminal states** (completed, cancelled, permanently rejected): `ttl = 259200` (72 hours).
- **Safety net:** All documents have an absolute maximum TTL of 30 days from creation. Workflows stuck in non-terminal states for > 30 days are auto-purged and flagged for admin review.

### 6.2 RBAC Enforcement at Each Step

```typescript
// Middleware: enforceWorkflowPermission
async function enforceWorkflowPermission(req: Request, step: WorkflowStep) {
  const token = extractJWT(req);  // from Authorization header — fresh session required
  const claims = validateToken(token, IAS_JWKS_URI);

  // Layer 1: Check ProcessIQ RBAC role
  const requiredRole = STEP_ROLE_MAP[step.type]; // e.g., 'workflow_approver_l1'
  if (!claims.processiq_roles.includes(requiredRole)) {
    throw new ForbiddenError('Insufficient role for this workflow step');
  }

  // Layer 2: Check SAP scope alignment
  const requiredScopes = STEP_SCOPE_MAP[step.type]; // e.g., ['quality.read']
  if (!requiredScopes.every(s => claims.scope.includes(s))) {
    throw new ForbiddenError('SAP authorization insufficient');
  }

  // Layer 3: Check resource-level access (plant, material group)
  if (step.plant && !claims.sap_plant.includes(step.plant)) {
    throw new ForbiddenError('No access to plant ' + step.plant);
  }

  // Layer 4: Fetch workflow state and validate assignment + status
  const workflowState = await getDecryptedWorkflowState(step.workflowId, step.stepId);

  // CRITICAL: Verify step is actually pending — prevents double-approval
  if (workflowState.status !== 'pending') {
    throw new ConflictError('Step is not in pending status: ' + workflowState.status);
  }

  // Verify step is assigned to this user (HMAC comparison)
  const expectedHmac = hmacSha256(claims.sub, TENANT_SCOPED_KEY);
  if (workflowState.assignedTo !== expectedHmac) {
    throw new ForbiddenError('This step is not assigned to you');
  }

  // Return the _etag for optimistic concurrency on the subsequent write
  return { etag: workflowState._etag };
}

// Usage in approval handler:
async function handleApproval(req: Request) {
  const { etag } = await enforceWorkflowPermission(req, step);

  // Cosmos DB conditional write — rejects with HTTP 409 if _etag changed
  // This prevents TOCTOU race conditions and double-approvals
  await cosmosContainer.item(step.id, step.tenantId).replace(
    { ...updatedState, status: 'approved', approvedAt: new Date().toISOString() },
    { accessCondition: { type: 'IfMatch', condition: etag } }
  );
}
```

---

## 7. SAP-Side Configuration Steps

### 7.1 SAP Identity Authentication Service (IAS)

| Step | Action | Details |
|------|--------|---------|
| **7.1.1** | Create Application in IAS | Type: OpenID Connect; Name: `ProcessIQ-Discovery` |
| **7.1.2** | Configure OAuth Client | Client ID generated; Client Secret generated; store in Azure Key Vault secret |
| **7.1.3** | Set Redirect URIs | `https://app.processiq.com/auth/callback` (production) |
| **7.1.4** | Define Custom Scopes | `product.search`, `bom.read`, `quality.read`, `recipe.read`, `workflow.create`, `workflow.approve` |
| **7.1.5** | Configure Custom Attributes | Map SAP user attributes to JWT claims: `sap_plant`, `sap_matgrp`, `sap_roles` |
| **7.1.6** | Enable MFA | Policy: TOTP or FIDO2 for all users; no SMS (SIM-swap risk) |
| **7.1.7** | Configure Risk-Based Auth | Trigger step-up auth for: new device, new IP range, impossible travel |
| **7.1.8** | Set Token Lifetimes | Access: 300s; Refresh: 3600s; ID Token: 300s |
| **7.1.9** | Enable Token Refresh Rotation | Single-use refresh tokens with automatic rotation |
| **7.1.10** | Register JWKS endpoint | ProcessIQ backend will fetch IAS public keys from `https://<tenant>.accounts.ondemand.com/oauth2/certs` |
| **7.1.11** | Configure IP Allowlist | Restrict token endpoint to ProcessIQ NAT Gateway static public IP |
| **7.1.12** | Enable Dual-Secret Support | Allow two active client secrets simultaneously for zero-downtime rotation |

### 7.2 SAP BTP — Destination Service

| Step | Action | Details |
|------|--------|---------|
| **7.2.1** | Create BTP Subaccount | Region matching customer data residency requirements and Cloud Connector location |
| **7.2.2** | Subscribe to Destination Service | Required for proxying on-prem calls |
| **7.2.3** | Create Destination | Name: `S4HANA_ONPREM`; Type: HTTP; URL: `https://s4hana-virtual:443`; Auth: `PrincipalPropagation` (NOT `OAuth2SAMLBearerAssertion` — no fallback mode) |
| **7.2.4** | Enable Principal Propagation | User identity from ProcessIQ JWT flows through to SAP for auth-object enforcement; fails closed on error |
| **7.2.5** | Configure mTLS | Import ProcessIQ backend's client certificate CA for mutual TLS verification |

### 7.3 SAP Cloud Connector

| Step | Action | Details |
|------|--------|---------|
| **7.3.1** | Install SCC | On a server in the customer's DMZ with outbound :443 access to BTP |
| **7.3.2** | Connect to BTP Subaccount | Pair SCC with the BTP subaccount using location ID |
| **7.3.3** | Add System Mapping | Virtual host → Internal host (see Section 4.1 table) |
| **7.3.4** | Add Resource Access Rules | Allowlist each OData service path explicitly (see Section 4.2) — no wildcards |
| **7.3.5** | Configure Principal Propagation Certificate | Generate CSR → sign with internal CA (1-year validity) → import to SCC. See Section 3.5 for full lifecycle |
| **7.3.6** | Enable Audit Logging | Log all access through the tunnel |
| **7.3.7** | HA Setup (Production) | Deploy SCC in HA pair (active-passive); heartbeat interval: 10s; failover threshold: 3 missed heartbeats; BTP re-pairing is transparent (no manual intervention) |

### 7.4 SAP S/4HANA On-Premise

| Step | Action | Details |
|------|--------|---------|
| **7.4.1** | Activate OData Services | `/IWFND/MAINT_SERVICE` — activate each service listed in Section 4.2 |
| **7.4.2** | Create Technical Communication User | `SU01` — type: System; password: none (certificate-based auth) |
| **7.4.3** | Assign Authorization Roles | Create `Z_PROCESSIQ_API` role with read-only access to required auth objects |
| **7.4.4** | Configure OAuth 2.0 Server | `SOAUTH2` — register OAuth 2.0 client for SAML bearer flow |
| **7.4.5** | Import IAS Signing Certificate | `STRUST` — import IAS SAML signing certificate as trusted provider; add to quarterly rotation review |
| **7.4.6** | Configure SAML 2.0 Trust | `SAML2` — add IAS as trusted Identity Provider |
| **7.4.7** | Map IAS Users to SAP Users | User attribute mapping: IAS `user_uuid` → SAP `ALIAS` or `EMAIL`; document orphan user cleanup procedure for deprovisioned IAS users |
| **7.4.8** | Add Technical User Guard | Create SAP Gateway constraint: OData calls from user workflow paths must NOT execute as the technical communication user. If principal propagation fails, the call must fail, not silently use the technical user |
| **7.4.9** | ICM HTTPS Configuration | `SMICM` — ensure HTTPS port (8443) is active with valid TLS certificate |
| **7.4.10** | Gateway Security | `/IWFND/ERROR_LOG` — enable security logging on Gateway |
| **7.4.11** | Rate Limiting | Apply `ICM/HTTP/MAX_REQUEST_SIZE` and connection limits to prevent abuse |

---

## 8. Third-Party App Configuration Steps (ProcessIQ Discovery)

### 8.1 Authentication Integration

| Step | Action | Details |
|------|--------|---------|
| **8.1.1** | Store IAS Credentials | Azure Key Vault secrets: `processiq-sap-ias-client-id`, `processiq-sap-ias-client-secret` (accessed by auth-identity MI only) |
| **8.1.2** | Implement OIDC Client | Use `openid-client` (Node.js) or equivalent; configure discovery URL: `https://<tenant>.accounts.ondemand.com/.well-known/openid-configuration` |
| **8.1.3** | Implement PKCE Flow | Generate `code_verifier` (43-128 chars, cryptographically random); derive `code_challenge` = `BASE64URL(SHA256(code_verifier))` |
| **8.1.4** | JWT Validation Middleware | Validate: signature (RS256 via JWKS), `iss`, `aud`, `exp`, `nbf`, `scope` |
| **8.1.5** | Claims-to-RBAC Mapper | Extract `sap_plant`, `sap_roles`, `scope` from JWT → map to ProcessIQ RBAC permissions |
| **8.1.6** | Session Management | Azure Cache for Redis (in-memory only, see Section 3.4); session cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, HMAC-signed |
| **8.1.7** | Token Refresh Handler | Background refresh 60s before expiry; on failure → redirect to IAS login |
| **8.1.8** | Secret Reload via Event Grid | Subscribe to Key Vault secret version change events; auto-reload IAS client secret without pod restart |
| **8.1.9** | CORS Configuration | ProcessIQ backend API: allowed origins = frontend domain only; `Access-Control-Allow-Credentials: true`; deny `OPTIONS` from non-allowed origins; no wildcard origins |

### 8.2 SAP API Client

| Step | Action | Details |
|------|--------|---------|
| **8.2.1** | Configure BTP Destination Client | Use BTP Destination Service SDK with mTLS client certificate to obtain on-premise proxy connection |
| **8.2.2** | Implement API Gateway Wrapper | Centralized SAP API client with: retry (3 attempts, exponential backoff), circuit breaker, timeout (30s), per-user rate limiting (see Section 3.2) |
| **8.2.3** | Response Handling | Read full SAP JSON response into RAM (not disk); pass to AI engine in-process; no intermediate file I/O |
| **8.2.4** | Data Classification Tagging | Wrap all SAP responses in `SAPDataEnvelope` (see Section 5.1) |
| **8.2.5** | Memory Cleanup | Request-scoped cleanup of SAP data buffers; process lifecycle is ephemeral (containers are short-lived). See Section 5.1 for GC limitations |

### 8.3 Encrypted Workflow Database

| Step | Action | Details |
|------|--------|---------|
| **8.3.1** | Create Cosmos DB Account | API: NoSQL; Capacity mode: Provisioned Autoscale (max 10,000 RU/s); Region: customer-specified (see Section 13); Encryption: CMK via Key Vault; **Public network access: DISABLED**; Private Endpoint in data subnet |
| **8.3.2** | Create Database & Container | Database: `processiq-workflows`; Container: `workflow-state`; Partition key: `/tenantId`; TTL: enabled |
| **8.3.3** | Create Key Vault Key (KEK) | Key name: `processiq-workflow-kek`; Type: RSA-2048; Auto key rotation: ON; Soft delete: ON; Purge protection: ON; **Public network access: DISABLED**; Private Endpoint in data subnet |
| **8.3.4** | Configure Managed Identities | Three system-assigned identities (auth, workflow, ai-engine) with least-privilege roles as per Section 5.3 Key Vault Access Control table |
| **8.3.5** | Implement Client-Side Encryption | Envelope encryption per-document: generate random DEK → encrypt fields with AES-256-GCM → wrap DEK with KEK via Key Vault → store wrappedDEK in document → discard DEK after request (NO CACHING) |
| **8.3.6** | Set TTL Rules | Active workflows: `ttl = null`; Terminal states: `ttl = 259200` (72h); Absolute max: `ttl = 2592000` (30 days) on creation |
| **8.3.7** | Create Composite Indexes | `(assignedTo ASC, status ASC)`, `(workflowType ASC, createdAt DESC)` |
| **8.3.8** | Enforce `_etag` Concurrency | All Cosmos DB write operations MUST use `accessCondition: { type: 'IfMatch', condition: etag }` — no exceptions |
| **8.3.9** | Configure Azure Budget Alert | Alert at 150% of baseline Cosmos DB monthly cost |
| **8.3.10** | HMAC Key for `assignedTo` | Generate tenant-scoped HMAC key; store in Key Vault; use for HMAC(user_uuid) to protect assignedTo from metadata correlation |

### 8.4 AI Engine Configuration

| Step | Action | Details |
|------|--------|---------|
| **8.4.1** | Self-Hosted Models Only | Configure Ollama (GPU tier) within VNet for all SAP data analysis — no external API calls |
| **8.4.2** | Ollama KV Cache Isolation | **MANDATORY:** Set `keep_alive: 0` (or `"0"`) on all Ollama API calls to disable KV cache retention between requests. This prevents SAP data from one user's inference leaking into another user's context via cached attention state |
| **8.4.3** | Prompt Injection Guard | Sanitize all SAP data before injecting into LLM prompts; use structured extraction (JSON schema), not raw text concatenation |
| **8.4.4** | Output Filtering | Post-process AI outputs to detect and redact any SAP data values that should not appear in user-facing results |
| **8.4.5** | Inference Memory Limit | Cap per-request memory allocation; force GC after each inference run |
| **8.4.6** | Health Check & Circuit Breaker | Ollama `/api/tags` health endpoint checked every 30s; circuit breaker trips after 3 consecutive failures; on Ollama unavailability, workflow initiation returns HTTP 503 with "AI analysis temporarily unavailable" (no degraded mode — SAP data must not be shown without AI-mediated analysis) |

---

## 9. Operational Concerns

### 9.1 Monitoring & Alerting

| Signal | Source | Alert Threshold |
|--------|--------|-----------------|
| Failed SAP API calls | Application logs → Azure Monitor | > 5 failures in 1 minute |
| Token refresh failures | Auth middleware → Azure Monitor | Any failure (immediate alert) |
| Cloud Connector tunnel down | SCC health check | Tunnel disconnect > 30 seconds |
| Key Vault throttling | Azure Monitor Key Vault metrics | Any `429 TooManyRequests` |
| Key Vault unauthorized access | Azure Monitor Diagnostic Logs | Any 401/403 from unexpected identity |
| Cosmos DB latency spike | Azure Monitor Cosmos DB metrics | p99 > 50ms |
| Cosmos DB RU consumption | Azure Monitor | > 80% of max autoscale RU/s |
| Cosmos DB cost anomaly | Azure Budget Alert | > 150% of baseline monthly cost |
| Unauthorized workflow access attempt | Application audit log → Azure Monitor | Any occurrence |
| TTL purge backlog | Cosmos DB metrics | Documents past TTL > 1000 |
| Ollama health check failure | Health check endpoint | 3 consecutive failures (circuit breaker trip) |
| Ollama GPU memory exhaustion | Container metrics | GPU memory > 90% |
| Principal propagation failure | SCC audit log + application error log | Any occurrence |
| SCC certificate expiry approaching | Certificate monitor | 60 days, 30 days, 7 days before expiry |
| IAS client secret expiry approaching | Key Vault secret expiry metadata | 30 days before rotation deadline |
| Redis session store eviction rate | Azure Cache for Redis metrics | Eviction rate > 10/min |

### 9.2 Disaster Recovery

| Component | RPO | RTO | Strategy |
|-----------|-----|-----|----------|
| Cosmos DB workflow state | 0 (continuous backup) | < 5 min | Cosmos DB continuous backup (PITR) + multi-region replication (if needed) |
| Key Vault keys | N/A | < 1 min | Geo-redundant by default; soft delete + purge protection enabled |
| Redis session store | N/A (ephemeral) | < 1 min | Sessions are reconstructed on user re-auth; no recovery needed |
| Cloud Connector | N/A | < 1 min (HA) / < 15 min (single) | HA pair with 30s failover detection; single-node requires manual restart |
| IAS | N/A | < 5 min | SAP-managed SLA; multi-AZ |

### 9.3 Performance Targets

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| SAP OData API call (via SCC) | < 500ms p95 | Depends on SAP system and query complexity |
| Cosmos DB encrypted read | < 15ms p95 | Client-side decrypt (Key Vault unwrap per request, no DEK cache) |
| Cosmos DB encrypted write | < 20ms p95 | Encrypt + Key Vault wrap + write |
| Workflow state transition | < 100ms p95 | Decrypt → validate → update → encrypt → conditional write |
| End-to-end AI analysis | < 30s p95 | SAP queries + inference + report generation |
| Key Vault unwrap operation | < 5ms p95 | Azure Key Vault SLA; within same region |

---

## 10. Compliance & Audit

### 10.1 Audit Log Schema

Every SAP-related action is logged (without logging actual SAP data):

```json
{
  "timestamp": "2026-03-30T14:22:00Z",
  "eventType": "SAP_API_CALL",
  "principal": "user_uuid_abc123",
  "sourceIP": "10.0.1.50",
  "action": "GET",
  "resource": "API_PRODUCT_SRV/A_Product",
  "sapPlant": "1000",
  "queryFilterHash": "sha256:a1b2c3d4...",
  "responseStatus": 200,
  "responseRecordCount": 47,
  "tokenScopes": ["product.search"],
  "workflowId": "550e8400-e29b-41d4-a716-446655440000",
  "dataPersisted": false,
  "correlationId": "req-abc-def-123"
}
```

**Audit log data protection rules:**
- **`queryFilters` are NEVER logged verbatim.** OData `$filter` values often contain SAP business data (material numbers, lot numbers, substance identifiers). Instead, a SHA-256 hash of the filter string is logged for correlation purposes.
- **Never logged:** Material numbers, descriptions, BOM details, quality values, or any SAP business data.
- **Access control:** Azure Monitor Log Analytics workspace is restricted to `admin` role and security operations team. No developer access to production audit logs.

### 10.2 Compliance Mapping

| Requirement | Implementation |
|-------------|---------------|
| **Data Minimization** (GDPR Art. 5) | Zero-persistence; TTL auto-purge; field-level encryption; HMAC for user identifiers |
| **Purpose Limitation** (GDPR Art. 5) | SAP data used only for lifecycle validation; scoped API access |
| **Right to Erasure** (GDPR Art. 17) | Workflow state deletion API; TTL auto-purge; no backup retention of SAP data |
| **Data Protection by Design** (GDPR Art. 25) | Client-side encryption via Key Vault; zero-persistence; principal propagation |
| **Data Transfer** (GDPR Ch. V) | See Section 13 — Azure region, BTP region, and SCC location must comply with data residency requirements |
| **SOC 2 — CC6.1** (Logical Access) | RBAC + SAP auth objects + MFA + risk-based auth + separate managed identities |
| **SOC 2 — CC6.7** (Data-in-Transit) | TLS 1.3 everywhere; SCC tunnel encryption; mTLS for ProcessIQ → BTP |
| **SOX Compliance** (if applicable) | Full audit trail; approval chain with non-repudiation; segregation of duties; _etag prevents double-approval |

---

## 11. Risks & Mitigations

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | SAP Cloud Connector single point of failure | High | Medium | HA pair; 30s failover detection; automatic failover; in-flight requests retried |
| R2 | Token theft enables unauthorized SAP access | Critical | Low | Short-lived tokens (5 min); MFA; IP restriction via NAT GW static IP; token binding |
| R3 | AI engine inadvertently stores SAP data | High | Medium | Code review; no disk I/O in inference path; `keep_alive: 0` on Ollama; memory is ephemeral |
| R4 | Key Vault key compromise | Critical | Very Low | Key rotation; Azure Monitor diagnostics; RBAC restricts to specific managed identities; soft delete + purge protection; separate MI per service |
| R5 | Cosmos DB TTL not purging fast enough | Medium | Low | Monitor TTL backlog; manual purge script as backup; TTL only set on terminal states (not active workflows) |
| R6 | SAP OData API changes break integration | Medium | Medium | Pin API versions; integration test suite; SAP release note monitoring |
| R7 | Prompt injection via SAP data | High | Medium | Input sanitization; structured JSON schema extraction; output filtering; `keep_alive: 0` |
| R8 | Insider threat — admin accesses encrypted data | High | Low | Separate managed identities per service; Key Vault Administrator cannot be Crypto User; audit all unwrap operations |
| R9 | Cloud Connector misconfiguration exposes unintended SAP services | Critical | Low | Path-level allowlist (no wildcards); quarterly access review of SCC resource rules |
| R10 | Latency spike due to Key Vault throttling | Medium | Low | Request-scoped DEK (no cache); Key Vault Premium tier for higher throughput if needed |
| R11 | IAS client secret compromised or expired | High | Low | 90-day rotation; dual-secret zero-downtime procedure; Event Grid auto-reload; emergency rotation runbook |
| R12 | SCC X.509 certificate expiry breaks integration | High | Medium | 1-year validity; automated alerts at 60/30/7 days; documented renewal procedure; fail-closed behavior |
| R13 | Principal propagation silent fallback to technical user | Critical | Low | BTP Destination set to `PrincipalPropagation` only (no fallback); SAP Gateway guard check; integration test |
| R14 | Metadata correlation via unencrypted Cosmos DB fields | Medium | Medium | `assignedTo` stored as HMAC; `workflowId` is random UUID v4; `status` and `workflowType` accepted as low-sensitivity |
| R15 | Ollama KV cache leaks SAP data between requests | High | Medium | `keep_alive: 0` mandatory; verified in integration test suite |
| R16 | BTP observes SAP data in transit | Medium | Low | Accepted risk — SAP is data owner; BTP is trusted third party; documented in Section 2.1 |
| R17 | Cosmos DB Provisioned Autoscale cost runaway | Medium | Low | Max RU/s ceiling; Azure Budget Alert at 150% of baseline |
| R18 | Redis session store compromise exposes tokens | High | Low | VNet-only (Private Endpoint); no persistence; Entra ID auth; TLS enforced |
| R19 | Workflow stuck in non-terminal state indefinitely | Low | Medium | 30-day absolute max TTL; admin alerting for workflows > 7 days old |

---

## 12. Incident Response Plan

### 12.1 Token Theft or Compromise

| Step | Action | Owner | SLA |
|------|--------|-------|-----|
| 1 | Revoke affected user's IAS session via IAS Admin Console | Security Ops | < 15 min |
| 2 | Lock affected SAP user via `SU01` | SAP Basis Admin | < 30 min |
| 3 | If client credentials compromised: emergency secret rotation (Section 3.5) | Platform Admin | < 1 hour |
| 4 | Audit all SAP API calls from compromised principal (Azure Monitor query) | Security Ops | < 2 hours |
| 5 | Assess data exposure scope; determine GDPR notification obligation | DPO / Legal | < 24 hours |

### 12.2 Encryption Key Compromise (KEK)

| Step | Action | Owner | SLA |
|------|--------|-------|-----|
| 1 | Disable compromised KEK version in Key Vault (do NOT delete — soft delete) | Platform Admin | < 15 min |
| 2 | Generate new KEK version (auto-rotation trigger or manual) | Platform Admin | < 30 min |
| 3 | Re-encrypt all active workflow documents with new DEKs wrapped by new KEK | Automated script | < 4 hours |
| 4 | Audit all Key Vault unwrap operations during compromise window | Security Ops | < 2 hours |
| 5 | Assess whether any DEK was extracted and used to decrypt Cosmos DB data | Security Ops | < 24 hours |
| 6 | GDPR breach notification if SAP personal data was decrypted | DPO / Legal | < 72 hours |

### 12.3 Cloud Connector Compromise

| Step | Action | Owner | SLA |
|------|--------|-------|-----|
| 1 | Disconnect SCC from BTP subaccount (revoke pairing) | SAP Basis Admin | < 15 min |
| 2 | Isolate SCC server from network | Network Ops | < 15 min |
| 3 | Audit all SCC tunnel traffic since last known clean state | Security Ops | < 4 hours |
| 4 | Provision new SCC instance on clean server; re-pair with BTP | SAP Basis Admin | < 8 hours |
| 5 | Rotate SCC X.509 certificates and SAP STRUST entries | SAP Basis Admin | < 8 hours |

### 12.4 GDPR Breach Notification

If SAP personal data (employee data, customer data) was accessed by unauthorized parties:

- **72-hour deadline** to notify the supervisory authority (GDPR Art. 33).
- **"Without undue delay"** to notify affected individuals if high risk (GDPR Art. 34).
- Notification must include: nature of breach, categories of data, approximate number of records, consequences, measures taken.

---

## 13. Data Residency & Transfer

### 13.1 Region Requirements

| Component | Location | Constraint |
|-----------|----------|------------|
| SAP S/4HANA | Customer on-premise site | Fixed by customer |
| SAP Cloud Connector | Customer DMZ | Same site as SAP S/4HANA |
| SAP BTP Subaccount | Must match SCC location | BTP region must be in same jurisdiction as SAP data |
| SAP IAS | SAP-managed; region selected at tenant creation | Should be same region as BTP subaccount |
| Azure Cosmos DB | Customer-specified Azure region | Must be in same jurisdiction as SAP data (e.g., EU customer → EU region) |
| Azure Key Vault | Same Azure region as Cosmos DB | Co-located for latency and data residency |
| Azure Cache for Redis | Same Azure region | Session tokens do not leave region |
| ProcessIQ Compute (ACA/AKS) | Same Azure region | All processing stays in-region |

### 13.2 Cross-Border Data Flows

SAP data flows through the following path:

```
SAP S/4HANA (on-prem) → SCC (on-prem DMZ) → BTP (SAP cloud, region X) → ProcessIQ (Azure, region Y)
```

If BTP region X and Azure region Y are in different jurisdictions (e.g., BTP in EU, Azure in US), this constitutes a cross-border transfer under GDPR. Mitigations:

1. **Preferred:** Select Azure region and BTP region in the same jurisdiction.
2. **If cross-border is unavoidable:** Standard Contractual Clauses (SCCs) with SAP and Microsoft; document in Data Processing Agreement.
3. **Data minimization:** Only SAP field values necessary for lifecycle validation are queried (no bulk exports).

---

## Appendix

### A. Glossary

| Term | Definition |
|------|-----------|
| **IAS** | SAP Identity Authentication Service — cloud-based identity provider |
| **SCC** | SAP Cloud Connector — reverse-invoke proxy for on-premise connectivity |
| **BTP** | SAP Business Technology Platform — SAP's cloud platform |
| **PKCE** | Proof Key for Code Exchange — OAuth extension preventing code interception |
| **KEK** | Key Encryption Key — Azure Key Vault key used to wrap/unwrap DEKs |
| **DEK** | Data Encryption Key — per-document symmetric key for field encryption |
| **CMK** | Customer Managed Key — Key Vault key under customer control for Cosmos DB server-side encryption |
| **HMAC** | Hash-based Message Authentication Code — used to protect `assignedTo` from metadata correlation |
| **CSFLE** | Client-Side Field Level Encryption (MongoDB term) |
| **Principal Propagation** | Forwarding end-user identity through middleware to backend SAP |
| **BOM** | Bill of Materials — product structure in SAP |
| **PLM** | Product Lifecycle Management |
| **ACA** | Azure Container Apps — serverless container platform |
| **AKS** | Azure Kubernetes Service — managed Kubernetes |
| **VNet** | Azure Virtual Network — isolated network boundary |
| **PE** | Private Endpoint — VNet-injected endpoint for Azure PaaS services |
| **MI** | Managed Identity — Azure-managed service principal for passwordless auth |
| **TOCTOU** | Time-of-Check-to-Time-of-Use — race condition class; mitigated by `_etag` conditional writes |

### B. SAP Transaction Codes Referenced

| T-Code | Purpose | Used In Step |
|--------|---------|--------------|
| `SU01` | User maintenance | 7.4.2, 12.1 |
| `SOAUTH2` | OAuth 2.0 client registration | 7.4.4 |
| `STRUST` | Certificate management | 7.4.5, 3.5, 12.3 |
| `SAML2` | SAML 2.0 configuration | 7.4.6 |
| `SMICM` | ICM administration | 7.4.9 |
| `/IWFND/MAINT_SERVICE` | OData service activation | 7.4.1 |
| `/IWFND/ERROR_LOG` | Gateway error/security log | 7.4.10 |
| `PFCG` | Role maintenance | 7.4.3 |

### C. Azure Resources Required

| Resource | Purpose | Estimated Cost (Monthly) |
|----------|---------|-------------------------|
| Azure Cosmos DB (Provisioned Autoscale, max 10K RU/s) | Workflow state storage | ~$50-100 (depends on RU consumption and storage) |
| Azure Key Vault (Standard) | KEK for field encryption + secrets storage | ~$5/month (keys: $5/key/month + $0.03/10K operations) |
| Azure Cache for Redis (Premium, VNet-integrated) | In-memory session store | ~$200/month (P1 tier for VNet + TLS) |
| Azure Monitor (Log Analytics) | Audit logging + alerting | ~$10-20 (depends on ingestion volume) |
| Azure Container Apps / AKS | Compute for ProcessIQ backend | Varies by workload |
| Azure Application Gateway + WAF v2 | Ingress + WAF | ~$200-350/month (WAF v2 tier) |
| Azure NAT Gateway + Static PIP | Stable egress IP for IAS allowlist | ~$35/month |
| BTP Destination Service | SAP on-prem proxy | Included in BTP subscription |
| Azure Event Grid | Key Vault secret rotation events | ~$1/month |

### D. References

- [SAP IAS — Configure OpenID Connect Application](https://help.sap.com/docs/identity-authentication/identity-authentication/configure-openid-connect-application)
- [SAP Cloud Connector — Installation and Configuration](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/cloud-connector)
- [SAP BTP Destination Service — Principal Propagation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/principal-propagation)
- [Azure Cosmos DB — Client-Side Encryption](https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-always-encrypted)
- [Azure Key Vault — Key Management](https://learn.microsoft.com/en-us/azure/key-vault/keys/about-keys)
- [Azure Cosmos DB — TTL Configuration](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/time-to-live)
- [Azure Managed Identity — Best Practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview)
- [Azure Private Endpoints](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview)
- [Azure WAF on Application Gateway](https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/ag-overview)
- [SAP S/4HANA OData API Reference](https://api.sap.com/products/SAPS4HANACloud/apis/REST)
- [OWASP OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [GDPR Breach Notification — Art. 33/34](https://gdpr-info.eu/art-33-gdpr/)
