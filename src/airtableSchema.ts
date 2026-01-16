import fetch from 'node-fetch';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

const BASE_URL = 'https://api.airtable.com/v0';

interface TableMetadata {
  tables: Array<{
    id: string;
    name: string;
    fields: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  }>;
}

/**
 * Get table metadata including all fields
 */
async function getTableMetadata(): Promise<TableMetadata> {
  const url = `${BASE_URL}/meta/bases/${AIRTABLE_BASE_ID}/tables`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable API error (${response.status}): ${errorText}`);
  }

  return await response.json() as TableMetadata;
}

/**
 * Create a field in the table
 */
async function createField(tableId: string, fieldName: string, fieldType: string, options?: any): Promise<void> {
  const url = `${BASE_URL}/meta/bases/${AIRTABLE_BASE_ID}/tables/${tableId}/fields`;

  const payload: any = {
    name: fieldName,
    type: fieldType
  };

  if (options) {
    payload.options = options;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create field ${fieldName}: ${errorText}`);
  }
}

/**
 * Ensure all required fields exist in the table
 */
export async function ensureRequiredFields(): Promise<void> {
  console.log('INFO: Checking and creating required Airtable fields...\n');

  try {
    const metadata = await getTableMetadata();

    // Find our table
    const table = metadata.tables.find(t => t.name === AIRTABLE_TABLE_NAME || t.id === AIRTABLE_TABLE_NAME);
    if (!table) {
      throw new Error(`Table "${AIRTABLE_TABLE_NAME}" not found`);
    }

    const existingFields = new Set(table.fields.map(f => f.name));

    // Define required fields
    const requiredFields = [
      { name: 'company', type: 'singleLineText' },
      { name: 'interviewer', type: 'singleLineText' },
      { name: 'interviewer_email', type: 'email' },
      { name: 'candidate', type: 'singleLineText' },
      { name: 'candidate_email', type: 'email' },
      { name: 'round_name', type: 'singleLineText' },
      { name: 'round_link', type: 'url' },
      { name: 'added_on_raw', type: 'singleLineText' },
      { name: 'added_on_parsed', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
      { name: 'mail_sent_at', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' } },
      { name: 'mail_status', type: 'singleSelect', options: { choices: [
        { name: 'sent' },
        { name: 'failed' },
        { name: 'queued' },
        { name: 'skipped' }
      ]}},
      { name: 'failure_reason', type: 'multilineText' },
      { name: 'tat_seconds', type: 'number', options: { precision: 0 } },
      { name: 'processed', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
      { name: 'idempotency_key', type: 'singleLineText' }
    ];

    // Create missing fields
    let createdCount = 0;
    for (const field of requiredFields) {
      if (!existingFields.has(field.name)) {
        console.log(`  Creating field: ${field.name} (${field.type})`);
        try {
          await createField(table.id, field.name, field.type, field.options);
          createdCount++;
        } catch (error: any) {
          console.warn(`  WARNING:  Failed to create field ${field.name}: ${error.message}`);
        }
      }
    }

    if (createdCount > 0) {
      console.log(`\nSUCCESS: Created ${createdCount} new fields in Airtable`);
    } else {
      console.log('SUCCESS: All required fields already exist\n');
    }
  } catch (error: any) {
    console.error(`ERROR: Error setting up Airtable fields: ${error.message}`);
    console.log('WARNING:  You may need to manually create the required fields in Airtable\n');
    throw error;
  }
}
