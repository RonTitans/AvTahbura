/**
 * Test the improved internal communication detection
 */

import { scoreContentQuality } from './rag/core/analyzer.js';

// Test cases
const testCases = [
  {
    name: "Internal: Staff greeting at start",
    doc: {
      response: "יונתן שלום העברתי במייל אליך ואל שלמה את התשובה של נפתלי. צריך את החלטתכם ראובן",
      inquiry: "קו 215 מבני ברק למודעין עילית",
      summary: ""
    },
    expected: "internal_communication"
  },
  {
    name: "Internal: Ariela greeting",
    doc: {
      response: "אריאלה שלום מדובר בפניה ישנה שהיתה עליה התכתבות במייל",
      inquiry: "קו 409",
      summary: ""
    },
    expected: "internal_communication"
  },
  {
    name: "Public: Formal response",
    doc: {
      response: "שלום רב, פנייתך התקבלה ונבדקה. בהתאם להנחיות משרד התחבורה, קו 409 ימשיך לפעול במתכונת הנוכחית. בברכה",
      inquiry: "בקשה להוספת תחנה בקו 409",
      summary: ""
    },
    expected: "public_response"
  },
  {
    name: "Internal: Status update between staff",
    doc: {
      response: "העברתי את זה למחוז ירושלים. צריך לקבל את עמדתו של ממונה גוש דן",
      inquiry: "קו 409",
      summary: ""
    },
    expected: "internal_communication"
  },
  {
    name: "Mixed: Has both patterns",
    doc: {
      response: "שלום רב, לגבי קו 490, צריך לקבל התייחסות מאינה. להלן התשובה לחלק השני של הפניה",
      inquiry: "קו 409",
      summary: ""
    },
    expected: "mixed_content"
  }
];

// Run tests
console.log('🧪 Testing Internal Communication Detection\n');
console.log('=' . repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach(testCase => {
  const result = scoreContentQuality(testCase.doc);
  const success = result.classification === testCase.expected;
  
  if (success) {
    passed++;
    console.log(`✅ ${testCase.name}`);
  } else {
    failed++;
    console.log(`❌ ${testCase.name}`);
  }
  
  console.log(`   Expected: ${testCase.expected}`);
  console.log(`   Got: ${result.classification} (score: ${result.score.toFixed(2)})`);
  console.log(`   Internal indicators: ${result.indicators.internalMatches}`);
  console.log(`   Public indicators: ${result.indicators.publicMatches}`);
  console.log();
});

console.log('=' . repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
console.log(`Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);