import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { CsvRow } from './types';
import { removeBOM } from './utils';

/**
 * Parse CSV file
 */
export async function parseCsvFile(filePath: string): Promise<CsvRow[]> {
  try {
    // Read file content
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove UTF-8 BOM if present
    content = removeBOM(content);

    // Parse CSV with csv-parse library
    const records = parse(content, {
      columns: true, // Use first row as headers
      skip_empty_lines: true,
      trim: true,
      bom: true, // Handle BOM
      relax_quotes: true, // Be permissive with quotes
      relax_column_count: true, // Handle inconsistent column counts
      skip_records_with_error: false
    }) as CsvRow[];

    console.log(`SUCCESS: Parsed ${records.length} records from CSV`);
    return records;
  } catch (error) {
    console.error('Error parsing CSV file:', error);
    throw new Error(`Failed to parse CSV file: ${error}`);
  }
}

/**
 * Validate CSV row has required fields
 */
export function validateCsvRow(row: CsvRow, rowIndex: number): string | null {
  const requiredFields = ['Company', 'Interviewer', 'Interviewer Email', 'Candidate', 'Candidate Email', 'Added On'];

  for (const field of requiredFields) {
    if (!row[field as keyof CsvRow] || row[field as keyof CsvRow].trim() === '') {
      return `Missing required field: ${field}`;
    }
  }

  return null;
}
