import { test as base } from 'playwright-bdd';
import { InterviewApiClient } from './api-helpers';
import { InterviewWorld, createWorld } from '../support/world';

export type TestFixtures = {
    world: InterviewWorld;
    apiClient: InterviewApiClient;
};

export const test = base.extend<TestFixtures>({
    world: async ({}, use) => {
        const world = createWorld();
        await use(world);
    },
    apiClient: async ({ world }, use) => {
        if (!world.apiToken) {
            const { token } = await InterviewApiClient.login('admin', 'admin');
            world.apiToken = token;
            world.userRole = 'admin';
        }
        const client = new InterviewApiClient(world.apiToken);
        await use(client);
    },
});
