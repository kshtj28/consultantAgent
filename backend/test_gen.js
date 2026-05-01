require('ts-node').register({ transpileOnly: true });

const { generateMultiSMEConsolidation } = require('./src/services/multiSMEConsolidationService');

async function test() {
    try {
        console.log("Testing generation for order_to_cash...");
        const result = await generateMultiSMEConsolidation({ processId: 'order_to_cash', forceMock: false });
        if (result == null) {
            console.log("Result is NULL - LLM failed or constraint blocked it!");
        } else {
            console.log("Success! Steps:", result.steps.length);
        }
    } catch (e) {
        console.error("Caught error:", e);
    }
}

test().then(() => process.exit(0));
