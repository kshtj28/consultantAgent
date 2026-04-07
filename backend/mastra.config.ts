import { Mastra } from '@mastra/core';
import { consultantAgent } from './src/mastra/agent';

export const mastra = new Mastra({
    agents: {
        consultant: consultantAgent,
    },
});

export default mastra;
