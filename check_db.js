const { Client } = require('@opensearch-project/opensearch');

const opensearchClient = new Client({
  node: process.env.OPENSEARCH_NODE || 'http://localhost:9200',
});

async function run() {
  const sessionsRes = await opensearchClient.search({
    index: 'erp_conversations',
    body: { query: { bool: { must: [{ match: { sessionType: 'interview_session' } }] } }, size: 200 },
  });
  const sessions = sessionsRes.body.hits.hits.map((h) => h._source).filter((s) => s && s.sessionId);
  console.log(`Found ${sessions.length} sessions`);
  
  for (const s of sessions) {
      console.log(`- Session: ${s.sessionId}, userId: ${s.userId}, status: ${s.status}, areas: ${s.selectedBroadAreas}`);
      const responses = s.responses || {};
      const totalAnswers = Object.values(responses).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
      );
      console.log(`  Answers: ${totalAnswers}`);
  }
}

run().catch(console.error);
