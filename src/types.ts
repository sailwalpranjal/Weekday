export interface CsvRow {
  Company: string;
  Interviewer: string;
  'Interviewer Email': string;
  Candidate: string;
  'Candidate Email': string;
  'Scheduling method': string;
  'Added On': string;
}

export interface RoundInfo {
  roundName: string;
  roundLink: string | null;
}

export interface AirtableRecord {
  company: string;
  interviewer: string;
  interviewer_email: string;
  candidate: string;
  candidate_email: string;
  round_name: string;
  round_link: string | null;
  added_on_raw: string;
  added_on_parsed: string; // ISO datetime
  mail_sent_at?: string; // ISO datetime UTC
  mail_status: 'sent' | 'failed' | 'queued' | 'skipped';
  failure_reason?: string;
  tat_seconds?: number;
  processed: boolean;
  idempotency_key: string;
}

export interface AirtableCreatePayload {
  fields: Partial<AirtableRecord>;
}

export interface AirtableUpdatePayload {
  id: string;
  fields: Partial<AirtableRecord>;
}

export interface EmailPayload {
  to: string;
  candidateName: string;
  company: string;
  interviewer: string;
  roundName: string;
  roundLink: string;
  idempotencyKey: string;
}

export interface ProcessingResult {
  totalRecords: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  emailsQueued: number;
  averageTAT: number;
}
