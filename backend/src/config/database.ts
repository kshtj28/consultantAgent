import { Client } from '@opensearch-project/opensearch';
import { env } from './env';

let nodeUrl = env.OPENSEARCH_NODE ? env.OPENSEARCH_NODE.replace(/^["']|["']$/g, '').trim() : '';
let authUsername = env.OPENSEARCH_USERNAME ? env.OPENSEARCH_USERNAME.replace(/^["']|["']$/g, '').trim() : '';
let authPassword = env.OPENSEARCH_PASSWORD ? env.OPENSEARCH_PASSWORD.replace(/^["']|["']$/g, '').trim() : '';

// Add https:// if missing to ensure URL parsing works
if (nodeUrl && !nodeUrl.startsWith('http')) {
  nodeUrl = 'https://' + nodeUrl;
}

// Extract credentials from URL if present (common for Bonsai)
try {
  const urlObj = new URL(nodeUrl);
  if (urlObj.username && urlObj.password) {
    authUsername = urlObj.username;
    authPassword = urlObj.password;
    // Remove credentials from the node URL to prevent conflicts
    urlObj.username = '';
    urlObj.password = '';
    nodeUrl = urlObj.toString();
  }
} catch (e) {
  console.warn('❌ Failed to parse OPENSEARCH_NODE URL:', e.message);
}

// Only send explicit auth if we actually have valid credentials
const hasExplicitAuth = Boolean(authUsername && authPassword && authUsername !== 'admin' && authPassword !== 'admin');

export const opensearchClient = new Client({
  node: nodeUrl || 'http://localhost:9200',
  ...(hasExplicitAuth ? {
    auth: {
      username: authUsername,
      password: authPassword,
    },
  } : {}),
  ssl: {
    rejectUnauthorized: false,
  },
});

// Index names
export const INDICES = {
  DOCUMENTS: 'consultant_documents',
  CONVERSATIONS: 'consultant_conversations',
  ENTITIES: 'consultant_entities',
  USERS: 'consultant_users',
  AUDIT_LOGS: 'consultant_audit_logs',
  NOTIFICATIONS: 'consultant_notifications',
  REPORTS: 'consultant_reports',
  DASHBOARD_METRICS: 'consultant_dashboard_metrics',
  SME_ENGAGEMENT: 'consultant_sme_engagement',
  INSIGHTS: 'consultant_insights',
  MULTI_SME_CONSOLIDATIONS: 'consultant_multi_sme_consolidations',
} as const;

// Initialize indices with proper mappings
export async function initializeIndices(): Promise<void> {
  try {
    // Documents index with vector embeddings
    const documentsExists = await opensearchClient.indices.exists({ index: INDICES.DOCUMENTS });
    if (!documentsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.DOCUMENTS,
        body: {
          settings: {
            'index.knn': true,
            'index.knn.algo_param.ef_search': 100,
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: {
            properties: {
              content: { type: 'text', analyzer: 'standard' },
              embedding: {
                type: 'knn_vector',
                dimension: 768,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil',
                  engine: 'nmslib',
                  parameters: { ef_construction: 128, m: 24 },
                },
              },
              documentId: { type: 'keyword' },
              filename: { type: 'keyword' },
              fileType: { type: 'keyword' },
              chunkIndex: { type: 'integer' },
              totalChunks: { type: 'integer' },
              uploadedBy: { type: 'keyword' },
              uploadedAt: { type: 'date' },
              metadata: { type: 'object', enabled: true },
              entities: {
                type: 'nested',
                properties: {
                  name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
                  type: { type: 'keyword' },
                  relationships: { type: 'keyword' },
                },
              },
            },
          },
        },
      });
      console.log('✅ Created documents index');
    }

    // Conversations index for memory
    const conversationsExists = await opensearchClient.indices.exists({ index: INDICES.CONVERSATIONS });
    if (!conversationsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.CONVERSATIONS,
        body: {
          mappings: {
            properties: {
              conversationId: { type: 'keyword' },
              userId: { type: 'keyword' },
              username: { type: 'keyword' },
              messages: {
                type: 'nested',
                properties: {
                  role: { type: 'keyword' },
                  content: { type: 'text' },
                  timestamp: { type: 'date' },
                },
              },
              context: { type: 'text' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created conversations index');
    }

    // Entities index for knowledge graph
    const entitiesExists = await opensearchClient.indices.exists({ index: INDICES.ENTITIES });
    if (!entitiesExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.ENTITIES,
        body: {
          mappings: {
            properties: {
              name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              type: { type: 'keyword' },
              description: { type: 'text' },
              sourceDocumentId: { type: 'keyword' },
              relationships: {
                type: 'nested',
                properties: {
                  targetEntity: { type: 'keyword' },
                  relationshipType: { type: 'keyword' },
                  description: { type: 'text' },
                },
              },
              attributes: { type: 'object', enabled: true },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created entities index');
    }

    // Users index for authentication
    const usersExists = await opensearchClient.indices.exists({ index: INDICES.USERS });
    if (!usersExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.USERS,
        body: {
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              username: { type: 'keyword' },
              passwordHash: { type: 'keyword' },
              role: { type: 'keyword' },
              firstName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              lastName: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              organization: { type: 'keyword' },
              department: { type: 'keyword' },
              status: { type: 'keyword' },
              createdAt: { type: 'date' },
              lastLoginAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created users index');
    }

    // Audit logs index
    const auditLogsExists = await opensearchClient.indices.exists({ index: INDICES.AUDIT_LOGS });
    if (!auditLogsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.AUDIT_LOGS,
        body: {
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              username: { type: 'keyword' },
              role: { type: 'keyword' },
              action: { type: 'keyword' },
              resource: { type: 'keyword' },
              resourceId: { type: 'keyword' },
              details: { type: 'text' },
              ipAddress: { type: 'keyword' },
              timestamp: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created audit_logs index');
    }

    // Notifications index
    const notificationsExists = await opensearchClient.indices.exists({ index: INDICES.NOTIFICATIONS });
    if (!notificationsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.NOTIFICATIONS,
        body: {
          mappings: {
            properties: {
              notificationId: { type: 'keyword' },
              userId: { type: 'keyword' },     // recipient
              type: { type: 'keyword' },        // session_completed, report_generated, risk_identified, user_created
              title: { type: 'text' },
              message: { type: 'text' },
              resourceType: { type: 'keyword' },
              resourceId: { type: 'keyword' },
              read: { type: 'boolean' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created notifications index');
    }

    // Reports index
    const reportsExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
    if (!reportsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.REPORTS,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: {
            properties: {
              reportId: { type: 'keyword' },
              name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              type: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              generatedBy: { type: 'keyword' },
              status: { type: 'keyword' },
              fileSize: { type: 'keyword' },
              downloadCount: { type: 'integer' },
              content: { type: 'object', enabled: false },
              createdAt: { type: 'date' },
              broadAreaId: { type: 'keyword' },
              broadAreaName: { type: 'text' },
              pendingRegeneration: { type: 'boolean' },
              previousContent: { type: 'object', enabled: false },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created reports index');
    }

    // Dashboard metrics index
    const metricsExists = await opensearchClient.indices.exists({ index: INDICES.DASHBOARD_METRICS });
    if (!metricsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.DASHBOARD_METRICS,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: {
            properties: {
              projectId: { type: 'keyword' },
              updatedAt: { type: 'date' },
              // KPI: Process Gap Severity
              gapSeverity: {
                type: 'object',
                properties: {
                  level: { type: 'keyword' },    // Low Risk | Medium Risk | High Risk | Critical
                  avgRisk: { type: 'integer' },   // 0-100
                  maxRisk: { type: 'integer' },    // gauge max
                },
              },
              // KPI: Critical Issues Identified
              criticalIssues: {
                type: 'object',
                properties: {
                  count: { type: 'integer' },
                  trend: { type: 'keyword' },     // up | down | stable
                },
              },
              // KPI: Automation Quotient
              automationQuotient: {
                type: 'object',
                properties: {
                  currentPct: { type: 'integer' },
                  improvementDelta: { type: 'integer' },
                  trend: { type: 'keyword' },     // up | down | stable
                },
              },
              // KPI: Discovery Progress
              discoveryProgress: {
                type: 'object',
                properties: {
                  pct: { type: 'integer' },
                  estCompletion: { type: 'keyword' },
                },
              },
              // Process Flow
              processFlow: {
                type: 'object',
                properties: {
                  title: { type: 'keyword' },
                  steps: {
                    type: 'nested',
                    properties: {
                      name: { type: 'keyword' },
                      stepNumber: { type: 'integer' },
                      status: { type: 'keyword' },    // normal | critical
                      avgDuration: { type: 'float' },
                      durationUnit: { type: 'keyword' }, // hrs | days
                    },
                  },
                  totalCycleTime: { type: 'float' },
                  cycleTimeUnit: { type: 'keyword' },  // days
                  criticalBottlenecks: { type: 'integer' },
                  automationOpportunity: { type: 'keyword' }, // Low | Medium | High
                },
              },
              // Process Analysis charts
              processTypeDistribution: {
                type: 'nested',
                properties: {
                  name: { type: 'keyword' },
                  value: { type: 'integer' },
                  percent: { type: 'integer' },
                },
              },
              processEfficiency: {
                type: 'nested',
                properties: {
                  name: { type: 'keyword' },
                  efficiency: { type: 'integer' },
                },
              },
              // KPI totals for reference
              totalSessions: { type: 'integer' },
              completedSessions: { type: 'integer' },
            },
          },
        },
      });
      console.log('✅ Created dashboard_metrics index');
    }

    // SME Engagement index
    const smeExists = await opensearchClient.indices.exists({ index: INDICES.SME_ENGAGEMENT });
    if (!smeExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.SME_ENGAGEMENT,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              username: { type: 'text' },
              role: { type: 'keyword' },
              department: { type: 'keyword' },
              engagementScore: { type: 'float' },
              participationRate: { type: 'float' },
              responseCount: { type: 'integer' },
              broadAreaCoverage: { type: 'object', enabled: true },
              lastActive: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created sme_engagement index');
    }

    // Insights index
    const insightsExists = await opensearchClient.indices.exists({ index: INDICES.INSIGHTS });
    if (!insightsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.INSIGHTS,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            properties: {
              sessionId: { type: 'keyword' },
              trendData: { type: 'object', enabled: true },
              gapAnalysis: { type: 'object', enabled: true },
              automationOpportunities: { type: 'object', enabled: true },
              recommendedActions: { type: 'nested', properties: {
                title: { type: 'text' },
                description: { type: 'text' },
                impact: { type: 'keyword' },
                effort: { type: 'keyword' },
                estimatedSavings: { type: 'text' },
                source: { type: 'keyword' },
              }},
              computedAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created insights index');
    }

    // Multi-SME Consolidation index
    const consolidationsExists = await opensearchClient.indices.exists({ index: INDICES.MULTI_SME_CONSOLIDATIONS });
    if (!consolidationsExists.body) {
      await opensearchClient.indices.create({
        index: INDICES.MULTI_SME_CONSOLIDATIONS,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            properties: {
              consolidationId: { type: 'keyword' },
              processId: { type: 'keyword' },
              processName: { type: 'text' },
              department: { type: 'keyword' },
              division: { type: 'keyword' },
              stakeholders: { type: 'object', enabled: true },
              metrics: { type: 'object', enabled: true },
              steps: { type: 'object', enabled: true },
              generatedAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      console.log('✅ Created multi_sme_consolidations index');
    }

    console.log('✅ All OpenSearch indices initialized');
  } catch (error) {
    console.error('❌ Error initializing OpenSearch indices:', error);
    throw error;
  }
}

export default opensearchClient;
