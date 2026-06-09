const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function searchTranscript() {
  const logDir = path.join('C:', 'Users', 'CEO', '.gemini', 'antigravity', 'brain', 'f6e57df8-2bde-4da7-abf4-9db90afc8bb5', '.system_generated', 'logs');
  const transcriptPath = path.join(logDir, 'transcript.jsonl');
  
  if (!fs.existsSync(transcriptPath)) {
    console.log("Transcript not found at", transcriptPath);
    return;
  }
  
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);
      if (entry.source === 'MODEL' && entry.type === 'PLANNER_RESPONSE') {
        const content = entry.content || '';
        if (content.includes('Helper') || content.includes('도우미') || content.includes('helper')) {
          console.log(`=== Step ${entry.step_index} ===`);
          console.log(content);
          console.log('\n-----------------------------------------\n');
        }
      }
    } catch (e) {}
  }
}

searchTranscript();
