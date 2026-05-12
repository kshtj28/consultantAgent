/**
 * Domain Configuration Service
 * Loads and manages domain-specific configurations for the Readiness Analysis Platform
 */

import * as fs from 'fs';
import * as path from 'path';

// Sub-area configuration (formerly DomainArea)
export interface SubArea {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
    basePrompt: string;
    benchmarks: {
        maturity_1: string;
        maturity_2: string;
        maturity_3: string;
        maturity_4: string;
        maturity_5: string;
    };
}

// Broad area configuration (groups sub-areas)
export interface BroadArea {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
    subAreas: SubArea[];
}

// Full domain configuration
export interface DomainConfig {
    id: string;
    name: string;
    description: string;
    persona: string;
    broadAreas: BroadArea[];
}

/** @deprecated Use SubArea instead */
export type DomainArea = SubArea;
export type DomainInterviewCategory = { id: string; name: string; order: number; description: string };

// Available domain IDs
export type DomainId = 'finance' | 'hr' | 'supplychain' | 'construction' | 'manufacturing' | 'banking' | 'strategy';

// Cache loaded domain configs
const domainCache: Map<string, DomainConfig> = new Map();

// Persist active domain selection across restarts
const ACTIVE_DOMAIN_FILE = path.join(__dirname, '..', 'config', 'activeDomain.json');

function readPersistedDomain(): DomainId {
    try {
        if (fs.existsSync(ACTIVE_DOMAIN_FILE)) {
            const { domainId } = JSON.parse(fs.readFileSync(ACTIVE_DOMAIN_FILE, 'utf-8'));
            if (domainId) return domainId as DomainId;
        }
    } catch { /* fall through to default */ }
    return 'banking';
}

function persistActiveDomain(domainId: DomainId): void {
    try {
        fs.writeFileSync(ACTIVE_DOMAIN_FILE, JSON.stringify({ domainId }), 'utf-8');
    } catch (err) {
        console.warn('Could not persist active domain setting:', err);
    }
}

// Active domain — loaded from disk, defaults to finance
let activeDomainId: DomainId = readPersistedDomain();

/**
 * Get the path to domain config files
 */
function getDomainConfigPath(domainId: string): string {
    return path.join(__dirname, '..', 'config', 'domains', `${domainId}.json`);
}

/**
 * Load a domain configuration from file
 */
export function loadDomainConfig(domainId: DomainId): DomainConfig {
    // Check cache first
    if (domainCache.has(domainId)) {
        return domainCache.get(domainId)!;
    }

    const configPath = getDomainConfigPath(domainId);

    if (!fs.existsSync(configPath)) {
        throw new Error(`Domain configuration not found: ${domainId}`);
    }

    try {
        const configData = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configData) as DomainConfig;

        // Validate required fields
        if (!config.id || !config.name || !config.broadAreas) {
            throw new Error(`Invalid domain configuration: missing required fields`);
        }

        // Cache the config
        domainCache.set(domainId, config);

        return config;
    } catch (error: any) {
        if (error.message.includes('Invalid domain')) {
            throw error;
        }
        throw new Error(`Failed to load domain configuration: ${error.message}`);
    }
}

/**
 * Get the currently active domain configuration
 */
export function getActiveDomainConfig(): DomainConfig {
    return loadDomainConfig(activeDomainId);
}

/**
 * Set the active domain
 */
export function setActiveDomain(domainId: DomainId): void {
    // Validate by attempting to load it
    loadDomainConfig(domainId);
    activeDomainId = domainId;
    persistActiveDomain(domainId);
    console.log(`🔧 Active domain set to: ${domainId}`);
}

/**
 * Get the active domain ID
 */
export function getActiveDomainId(): DomainId {
    return activeDomainId;
}

// ─── New hierarchy-aware functions ────────────────────────────────────────────

/**
 * Get all broad areas for the active domain, sorted by order
 */
export function getBroadAreas(): BroadArea[] {
    const config = getActiveDomainConfig();
    return [...config.broadAreas].sort((a, b) => a.order - b.order);
}

/**
 * Get a specific broad area by ID
 */
export function getBroadArea(broadAreaId: string): BroadArea | undefined {
    const config = getActiveDomainConfig();
    return config.broadAreas.find(ba => ba.id === broadAreaId);
}

/**
 * Get sub-areas within a broad area, sorted by order
 */
export function getSubAreasForBroadArea(broadAreaId: string): SubArea[] {
    const broadArea = getBroadArea(broadAreaId);
    return broadArea ? [...broadArea.subAreas].sort((a, b) => a.order - b.order) : [];
}

/**
 * Get all sub-areas across all broad areas, sorted by order
 */
export function getAllSubAreas(): SubArea[] {
    const config = getActiveDomainConfig();
    return config.broadAreas.flatMap(ba => ba.subAreas).sort((a, b) => a.order - b.order);
}

/**
 * Get a specific sub-area by ID (searches across all broad areas)
 */
export function getSubArea(subAreaId: string): SubArea | undefined {
    const config = getActiveDomainConfig();
    for (const ba of config.broadAreas) {
        const sub = ba.subAreas.find(s => s.id === subAreaId);
        if (sub) return sub;
    }
    return undefined;
}

/**
 * Get the broad area that contains a given sub-area
 */
export function getBroadAreaForSubArea(subAreaId: string): BroadArea | undefined {
    const config = getActiveDomainConfig();
    return config.broadAreas.find(ba => ba.subAreas.some(s => s.id === subAreaId));
}

// ─── Backward-compatible wrappers ─────────────────────────────────────────────

/** @deprecated Use getAllSubAreas() */
export function getDomainAreas(): SubArea[] {
    return getAllSubAreas();
}

/** @deprecated Use getSubArea() */
export function getDomainArea(areaId: string): SubArea | undefined {
    return getSubArea(areaId);
}

/**
 * Get the AI persona for the active domain
 */
export function getDomainPersona(): string {
    const config = getActiveDomainConfig();
    return config.persona;
}

/** @deprecated Use getSubArea()?.basePrompt */
export function getAreaBasePrompt(areaId: string): string {
    return getSubArea(areaId)?.basePrompt || '';
}

/** @deprecated Use getSubArea()?.benchmarks */
export function getAreaBenchmarks(areaId: string): SubArea['benchmarks'] | null {
    return getSubArea(areaId)?.benchmarks || null;
}

/**
 * Get list of available domains
 */
export function getAvailableDomains(): { id: DomainId; name: string; description: string }[] {
    const domainIds: DomainId[] = ['finance', 'hr', 'supplychain', 'construction', 'manufacturing', 'banking', 'strategy'];

    return domainIds.map(id => {
        try {
            const config = loadDomainConfig(id);
            return {
                id,
                name: config.name,
                description: config.description,
            };
        } catch {
            return {
                id,
                name: id,
                description: 'Configuration not available',
            };
        }
    });
}

/**
 * Check if a domain ID is valid
 */
export function isValidDomain(domainId: string): domainId is DomainId {
    return ['finance', 'hr', 'supplychain', 'construction', 'manufacturing', 'banking'].includes(domainId);
}

/**
 * Clear the domain cache (useful for development/testing)
 */
export function clearDomainCache(): void {
    domainCache.clear();
}

// ─── Interview category wrappers (deprecated) ────────────────────────────────

/** @deprecated Broad areas replace interview categories */
export function getInterviewCategories(): DomainInterviewCategory[] {
    return getBroadAreas().map(ba => ({ id: ba.id, name: ba.name, order: ba.order, description: ba.description }));
}

/** @deprecated */
export function getInterviewCategory(id: string): DomainInterviewCategory | undefined {
    const ba = getBroadArea(id);
    return ba ? { id: ba.id, name: ba.name, order: ba.order, description: ba.description } : undefined;
}

/** @deprecated */
export function isValidInterviewCategory(id: string): boolean {
    return !!getBroadArea(id);
}
