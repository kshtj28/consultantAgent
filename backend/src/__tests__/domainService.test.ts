import { describe, it, expect, beforeEach } from 'vitest';
import {
    loadDomainConfig,
    getActiveDomainConfig,
    setActiveDomain,
    getActiveDomainId,
    getDomainAreas,
    getDomainArea,
    getDomainPersona,
    getAreaBasePrompt,
    getAreaBenchmarks,
    getAvailableDomains,
    isValidDomain,
    clearDomainCache,
    DomainId,
} from '../services/domainService';

describe('Domain Service', () => {
    beforeEach(() => {
        // Clear cache and reset to default domain before each test
        clearDomainCache();
        setActiveDomain('finance');
    });

    describe('loadDomainConfig', () => {
        it('should load finance domain configuration', () => {
            const config = loadDomainConfig('finance');
            expect(config.id).toBe('finance');
            expect(config.name).toBe('Banking');
            expect(config.broadAreas).toBeDefined();
            expect(config.broadAreas.length).toBeGreaterThan(0);
        });

        it('should load hr domain configuration', () => {
            const config = loadDomainConfig('hr');
            expect(config.id).toBe('hr');
            expect(config.name).toBe('Human Resources');
        });

        it('should load supplychain domain configuration', () => {
            const config = loadDomainConfig('supplychain');
            expect(config.id).toBe('supplychain');
            expect(config.name).toBe('Supply Chain');
        });

        it('should throw error for non-existent domain', () => {
            expect(() => loadDomainConfig('nonexistent' as DomainId)).toThrow();
        });

        it('should cache loaded configurations', () => {
            const config1 = loadDomainConfig('finance');
            const config2 = loadDomainConfig('finance');
            expect(config1).toBe(config2); // Same reference
        });
    });

    describe('getActiveDomainConfig', () => {
        it('should return finance by default', () => {
            const config = getActiveDomainConfig();
            expect(config.id).toBe('finance');
        });
    });

    describe('setActiveDomain', () => {
        it('should switch to hr domain', () => {
            setActiveDomain('hr');
            expect(getActiveDomainId()).toBe('hr');

            const config = getActiveDomainConfig();
            expect(config.id).toBe('hr');
        });

        it('should throw error for invalid domain', () => {
            expect(() => setActiveDomain('invalid' as DomainId)).toThrow();
        });
    });

    describe('getDomainAreas', () => {
        it('should return sorted areas for finance', () => {
            const areas = getDomainAreas();
            expect(areas.length).toBe(15);
            // Sub-area orders are relative within their broad area, so just verify we get sorted results
            expect(areas[0].order).toBeLessThanOrEqual(areas[1].order);
        });

        it('should return areas with required fields', () => {
            const areas = getDomainAreas();
            for (const area of areas) {
                expect(area.id).toBeDefined();
                expect(area.name).toBeDefined();
                expect(area.icon).toBeDefined();
                expect(area.description).toBeDefined();
                expect(area.basePrompt).toBeDefined();
                expect(area.benchmarks).toBeDefined();
            }
        });

        it('should return different areas for hr domain', () => {
            setActiveDomain('hr');
            const areas = getDomainAreas();
            expect(areas.length).toBe(5);
            expect(areas.some(a => a.id === 'recruiting')).toBe(true);
        });
    });

    describe('getDomainArea', () => {
        it('should return accounts_payable area', () => {
            const area = getDomainArea('accounts_payable');
            expect(area).toBeDefined();
            expect(area?.name).toBe('Accounts Payable');
        });

        it('should return undefined for non-existent area', () => {
            const area = getDomainArea('nonexistent');
            expect(area).toBeUndefined();
        });
    });

    describe('getDomainPersona', () => {
        it('should return finance persona', () => {
            const persona = getDomainPersona();
            expect(persona).toContain('finance');
            expect(persona.length).toBeGreaterThan(50);
        });

        it('should return hr persona when domain is hr', () => {
            setActiveDomain('hr');
            const persona = getDomainPersona();
            expect(persona).toContain('HR');
        });
    });

    describe('getAreaBasePrompt', () => {
        it('should return base prompt for accounts_payable', () => {
            const prompt = getAreaBasePrompt('accounts_payable');
            expect(prompt).toContain('invoice');
        });

        it('should return empty string for non-existent area', () => {
            const prompt = getAreaBasePrompt('nonexistent');
            expect(prompt).toBe('');
        });
    });

    describe('getAreaBenchmarks', () => {
        it('should return benchmarks with maturity levels', () => {
            const benchmarks = getAreaBenchmarks('accounts_payable');
            expect(benchmarks).toBeDefined();
            expect(benchmarks?.maturity_1).toBeDefined();
            expect(benchmarks?.maturity_5).toBeDefined();
        });

        it('should return null for non-existent area', () => {
            const benchmarks = getAreaBenchmarks('nonexistent');
            expect(benchmarks).toBeNull();
        });
    });

    describe('getAvailableDomains', () => {
        it('should return list of available domains', () => {
            const domains = getAvailableDomains();
            expect(domains.length).toBe(5);
            expect(domains.some(d => d.id === 'finance')).toBe(true);
            expect(domains.some(d => d.id === 'hr')).toBe(true);
            expect(domains.some(d => d.id === 'supplychain')).toBe(true);
            expect(domains.some(d => d.id === 'construction')).toBe(true);
            expect(domains.some(d => d.id === 'manufacturing')).toBe(true);
        });

        it('should include name and description for each domain', () => {
            const domains = getAvailableDomains();
            for (const domain of domains) {
                expect(domain.name).toBeDefined();
                expect(domain.description).toBeDefined();
            }
        });
    });

    describe('isValidDomain', () => {
        it('should return true for valid domains', () => {
            expect(isValidDomain('finance')).toBe(true);
            expect(isValidDomain('hr')).toBe(true);
            expect(isValidDomain('supplychain')).toBe(true);
        });

        it('should return false for invalid domains', () => {
            expect(isValidDomain('invalid')).toBe(false);
            expect(isValidDomain('')).toBe(false);
            expect(isValidDomain('FINANCE')).toBe(false);
        });
    });
});
