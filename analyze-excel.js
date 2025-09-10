import XLSX from 'xlsx';
import fs from 'fs';

// Read the Excel file
const workbook = XLSX.readFile('F:/ClaudeCode/AvTahbura/Copy of Cleaned_Answers_Data.xlsx');
console.log('Sheet names:', workbook.SheetNames);

// Try each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  
  // Get raw data with all cells
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log('Total rows:', rawData.length);
  
  if (rawData.length > 0) {
    const headers = rawData[0];
    console.log('Headers:');
    headers.forEach((header, idx) => {
      if (header) console.log(`  Column ${idx}: "${header}"`);
    });
    
    // Show sample data
    console.log('\nSample data (first 3 rows):');
    for (let i = 1; i <= Math.min(3, rawData.length - 1); i++) {
      console.log(`Row ${i}:`, rawData[i].slice(0, 7));
    }
  }
});

// Analyze inquiry IDs
const inquiryCol = 'מזהה פניה';
const dateCol = 'תאריך פניה';
const responseCol = 'תוכן מענה';

const grouped = {};
data.forEach(row => {
  const id = row[inquiryCol];
  if (id) {
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push({
      date: row[dateCol],
      response: row[responseCol],
      rowIndex: data.indexOf(row)
    });
  }
});

console.log('\n=== Inquiry ID Analysis ===');
console.log('Unique inquiry IDs:', Object.keys(grouped).length);
console.log('Inquiries with multiple rows:', Object.values(grouped).filter(g => g.length > 1).length);

// Show examples of duplicates
console.log('\n=== Sample Duplicates ===');
const duplicates = Object.entries(grouped).filter(([id, rows]) => rows.length > 1).slice(0, 5);
duplicates.forEach(([id, rows]) => {
  console.log(`\nInquiry ID ${id}: ${rows.length} rows`);
  rows.forEach(row => {
    console.log(`  - Date: ${row.date}, Response preview: ${row.response?.substring(0, 50)}...`);
  });
});

// Analyze patterns
console.log('\n=== Data Patterns ===');
const distribution = {};
Object.values(grouped).forEach(rows => {
  const count = rows.length;
  distribution[count] = (distribution[count] || 0) + 1;
});
console.log('Row count distribution:');
Object.entries(distribution).forEach(([count, freq]) => {
  console.log(`  ${count} row(s): ${freq} inquiries`);
});