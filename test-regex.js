// Test word boundary regex with Hebrew text
const testCases = [
  { text: "קו 30 לא מגיע", line: "30", shouldMatch: true },
  { text: "קו 630 מגיע", line: "30", shouldMatch: false },
  { text: "הוספת תחנה בנסיעת קו 408", line: "408", shouldMatch: true },
  { text: "קווים 30, 40", line: "30", shouldMatch: true },
  { text: "בקו 1305", line: "30", shouldMatch: false },
  { text: "30", line: "30", shouldMatch: true },
  { text: "630", line: "30", shouldMatch: false },
  { text: "קו 408 של חברת", line: "408", shouldMatch: true },
  { text: "4408", line: "408", shouldMatch: false },
];

testCases.forEach(test => {
  const patterns = [
    new RegExp(`\\b${test.line}\\b`, 'g'),
    new RegExp(`קו\\s+${test.line}\\b`, 'g'),
    new RegExp(`קווים[^0-9]*${test.line}\\b`, 'g'),
  ];
  
  let matched = false;
  for (const pattern of patterns) {
    if (pattern.test(test.text)) {
      matched = true;
      break;
    }
  }
  
  const result = matched === test.shouldMatch ? '✅' : '❌';
  console.log(`${result} "${test.text}" with line ${test.line}: matched=${matched}, expected=${test.shouldMatch}`);
});