import fetch from 'node-fetch';
import { AirtableRecord } from './types';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME!;

const BASE_URL = 'https://api.airtable.com/v0';

interface AirtableResponse {
  id: string;
  fields: any;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableResponse[];
  offset?: string;
}

/**
 * Create a new record in Airtable
 */
export async function createAirtableRecord(record: Partial<AirtableRecord>): Promise<string> {
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

  const payload = {
    fields: record
  };

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
    throw new Error(`Airtable API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as AirtableResponse;
  return data.id;
}

/**
 * Update an existing record in Airtable
 */
export async function updateAirtableRecord(recordId: string, updates: Partial<AirtableRecord>): Promise<void> {
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${recordId}`;

  const payload = {
    fields: updates
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airtable API error (${response.status}): ${errorText}`);
  }
}

/**
 * Find records by idempotency key
 */
export async function findRecordByIdempotencyKey(idempotencyKey: string): Promise<AirtableResponse | null> {
  try {
    const formula = `{idempotency_key} = '${idempotencyKey}'`;
    const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`
      }
    });

    if (!response.ok) {
      // If 404, it likely means the field doesn't exist yet - treat as no records found
      if (response.status === 404) {
        return null;
      }
      const errorText = await response.text();
      throw new Error(`Airtable API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as AirtableListResponse;

    if (data.records && data.records.length > 0) {
      return data.records[0];
    }

    return null;
  } catch (error: any) {
    // If error contains field-related issues, treat as no records found
    if (error.message && error.message.includes('Unknown field name')) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if record exists and is already processed
 */
export async function isRecordProcessed(idempotencyKey: string): Promise<{ exists: boolean; recordId?: string }> {
  const record = await findRecordByIdempotencyKey(idempotencyKey);

  if (record && record.fields.processed === true && record.fields.mail_sent_at) {
    return { exists: true, recordId: record.id };
  }

  if (record) {
    return { exists: true, recordId: record.id };
  }

  return { exists: false };
}

/**
 * Get all records (for debugging)
 */
export async function getAllRecords(): Promise<AirtableResponse[]> {
  const url = `${BASE_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

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

  const data = await response.json() as AirtableListResponse;
  return data.records || [];
}
