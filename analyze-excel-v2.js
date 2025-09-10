import XLSX from 'xlsx';

// Read the new Excel file
const workbook = XLSX.readFile('F:/ClaudeCode/AvTahbura/Copy of Cleaned_Answers_Data (1).xlsx');
console.log('Sheet names:', workbook.SheetNames);

// Analyze the main sheet
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('\n=== Excel File Analysis ===');
console.log('Total rows:', data.length);

if (data.length > 0) {
  console.log('\nColumn names:', Object.keys(data[0]));
  
  // Look for the inquiry ID column (מזהה פניה)
  const sampleRow = data[0];
  console.log('\n=== Sample First Row ===');
  Object.entries(sampleRow).forEach(([key, value]) => {
    const preview = value?.toString().substring(0, 100);
    console.log(`${key}: ${preview}${value?.toString().length > 100 ? '...' : ''}`);
  });
}

// Find inquiry ID column
const possibleIdColumns = Object.keys(data[0] || {}).filter(col => 
  col.includes('מזהה') || col.includes('פניה') || col.includes('ID') || col.includes('Case')
);

console.log('\n=== Possible ID Columns ===');
console.log(possibleIdColumns);

// Analyze duplicates for each potential ID column
possibleIdColumns.forEach(idCol => {
  console.log(`\n=== Analyzing column: ${idCol} ===`);
  
  const groupedById = {};
  data.forEach((row, idx) => {
    const id = row[idCol];
    if (id) {
      if (!groupedById[id]) groupedById[id] = [];
      groupedById[id].push({
        rowIndex: idx,
        date: row['תאריך פניה'] || row['תאריך'] || row['Date'],
        response: row['תוכן מענה'] || row['תשובה'] || row['Response'],
        inquiry: row['תוכן פניה'] || row['פניה'] || row['Inquiry']
      });
    }
  });
  
  const uniqueIds = Object.keys(groupedById).length;
  const duplicateIds = Object.values(groupedById).filter(rows => rows.length > 1);
  
  console.log(`Unique IDs: ${uniqueIds}`);
  console.log(`IDs with duplicates: ${duplicateIds.length}`);
  
  // Show examples of duplicates
  if (duplicateIds.length > 0) {
    console.log('\n=== Sample Duplicate Cases ===');
    duplicateIds.slice(0, 3).forEach(rows => {
      const id = data[rows[0].rowIndex][idCol];
      console.log(`\nID ${id}: ${rows.length} rows`);
      rows.forEach(row => {
        console.log(`  Row ${row.rowIndex}: Date=${row.date}, Response preview: ${row.response?.substring(0, 50)}...`);
      });
    });
  }
});

// Analyze the date column more carefully
console.log('\n=== Date Analysis for Duplicates ===');
const dateCol = 'נוצר ב:';

// Pick a sample ID with duplicates
const sampleId = 'CAS-643141-W7B0X3';
const sampleRows = data.filter(row => row['מזהה פניה'] === sampleId);

console.log(`\nExample: ${sampleId} has ${sampleRows.length} rows`);
sampleRows.forEach((row, idx) => {
  const excelDate = row[dateCol];
  // Excel dates are days since 1900-01-01
  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
  console.log(`  Row ${idx}:`);
  console.log(`    Date value: ${excelDate}`);
  console.log(`    Converted: ${jsDate.toLocaleDateString('he-IL')}`);
  console.log(`    Response preview: ${row['תיאור']?.substring(0, 60)}...`);
});

// Find pattern: group by ID and keep only latest
console.log('\n=== Deduplication Strategy ===');
const deduplicated = {};
data.forEach(row => {
  const id = row['מזהה פניה'];
  const date = row[dateCol];
  
  if (!deduplicated[id] || date > deduplicated[id][dateCol]) {
    deduplicated[id] = row;
  }
});

console.log(`Original rows: ${data.length}`);
console.log(`After keeping latest only: ${Object.keys(deduplicated).length}`);
console.log(`Rows removed: ${data.length - Object.keys(deduplicated).length}`);