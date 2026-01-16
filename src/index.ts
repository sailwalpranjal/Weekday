import * as dotenv from 'dotenv';
dotenv.config();

import * as path from 'path';
import { parseCsvFile, validateCsvRow } from './csvParser';
import { splitRounds } from './roundSplitter';
import {
  parseAddedOnDate,
  toISOString,
  calculateTAT,
  generateIdempotencyKey,
  isValidEmail,
  validateUrl,
  createSourceIdentifier,
  isInFuture
} from './utils';
import {
  createAirtableRecord,
  updateAirtableRecord,
  isRecordProcessed
} from './airtableClient';
import { ensureRequiredFields } from './airtableSchema';
import { sendInvitationEmail } from './emailSender';
import { CsvRow, AirtableRecord, ProcessingResult } from './types';

const FORCE_SEND = process.env.FORCE_SEND === 'true';

/**
 * Main orchestration function
 */
async function main() {
  console.log('Starting Interview Automation System\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let csvFilePath: string | null = null;
  let useAirtable = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) {
      csvFilePath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--use-airtable') {
      useAirtable = true;
    }
  }

  // Validate arguments
  if (!csvFilePath && !useAirtable) {
    console.error('ERROR: Error: Must specify either --csv <path> or --use-airtable');
    console.log('\nUsage:');
    console.log('  node dist/index.js --csv ./input/data.csv');
    console.log('  node dist/index.js --use-airtable');
    process.exit(1);
  }

  // Validate environment variables
  validateEnvironment();

  // Ensure Airtable fields exist
  try {
    await ensureRequiredFields();
  } catch (error) {
    console.error('ERROR: Failed to set up Airtable fields. Please create them manually.');
    process.exit(1);
  }

  let csvData: CsvRow[] = [];

  if (csvFilePath) {
    console.log(`Reading CSV file: Reading CSV file: ${csvFilePath}\n`);
    csvData = await parseCsvFile(csvFilePath);
  } else {
    console.error('ERROR: Error: --use-airtable mode not implemented in this version');
    console.log('Please use --csv mode with the provided CSV file');
    process.exit(1);
  }

  // Process records
  const result = await processRecords(csvData);

  // Print summary
  printSummary(result);

  console.log('\nSUCCESS: Processing complete!');
}

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const required = [
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
    'AIRTABLE_TABLE_NAME',
    'MAILERSEND_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.log('\nPlease set these in your .env file or environment');
    process.exit(1);
  }
}

/**
 * Process all CSV records
 */
async function processRecords(csvData: CsvRow[]): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    totalRecords: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    emailsQueued: 0,
    averageTAT: 0
  };

  const tatValues: number[] = [];
  let quotaExhausted = false;

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];

    // Validate row
    const validationError = validateCsvRow(row, i);
    if (validationError) {
      console.warn(`WARNING:  Row ${i + 1}: ${validationError}`);
      continue;
    }

    // Parse Added On date
    const addedOnDate = parseAddedOnDate(row['Added On']);
    if (!addedOnDate) {
      console.warn(`WARNING:  Row ${i + 1}: Could not parse "Added On" date: ${row['Added On']}`);
      continue;
    }

    // Split rounds
    const rounds = splitRounds(row['Scheduling method']);

    if (rounds.length === 0) {
      console.warn(`WARNING:  Row ${i + 1}: No rounds detected for ${row.Candidate}`);
      continue;
    }

    console.log(`\nProcessing: Processing ${row.Candidate} at ${row.Company} (${rounds.length} rounds)`);

    // Process each round
    for (const round of rounds) {
      result.totalRecords++;

      // Create source identifier
      const sourceId = createSourceIdentifier(row, i);

      // Generate idempotency key
      const idempotencyKey = generateIdempotencyKey(
        sourceId,
        round.roundName,
        row['Candidate Email']
      );

      // Check if already processed
      const { exists, recordId } = await isRecordProcessed(idempotencyKey);

      if (exists && !FORCE_SEND) {
        console.log(`  SKIPPED:  ${round.roundName}: Already processed (record ID: ${recordId})`);
        result.emailsSkipped++;
        continue;
      }

      // Validate candidate email
      if (!isValidEmail(row['Candidate Email'])) {
        console.log(`  FAILED: ${round.roundName}: Invalid email: ${row['Candidate Email']}`);
        await createOrUpdateRecord(recordId, {
          company: row.Company,
          interviewer: row.Interviewer,
          interviewer_email: row['Interviewer Email'],
          candidate: row.Candidate,
          candidate_email: row['Candidate Email'],
          round_name: round.roundName,
          round_link: round.roundLink,
          added_on_raw: row['Added On'],
          added_on_parsed: toISOString(addedOnDate),
          mail_status: 'skipped',
          failure_reason: 'invalid_email',
          processed: false,
          idempotency_key: idempotencyKey
        });
        result.emailsSkipped++;
        continue;
      }

      // Validate round link
      let finalRoundLink = round.roundLink;
      let linkValidation = null;

      if (finalRoundLink) {
        linkValidation = validateUrl(finalRoundLink);
        if (!linkValidation.valid) {
          console.log(`  WARNING:  ${round.roundName}: Invalid URL, will skip sending`);
          await createOrUpdateRecord(recordId, {
            company: row.Company,
            interviewer: row.Interviewer,
            interviewer_email: row['Interviewer Email'],
            candidate: row.Candidate,
            candidate_email: row['Candidate Email'],
            round_name: round.roundName,
            round_link: finalRoundLink,
            added_on_raw: row['Added On'],
            added_on_parsed: toISOString(addedOnDate),
            mail_status: 'skipped',
            failure_reason: 'invalid_url',
            processed: false,
            idempotency_key: idempotencyKey
          });
          result.emailsSkipped++;
          continue;
        }

        if (linkValidation.unverifiedDomain) {
          console.log(`  ℹ️  ${round.roundName}: URL domain not in allowlist (preserving anyway)`);
        }
      } else {
        console.log(`  WARNING:  ${round.roundName}: No scheduling link provided, skipping`);
        await createOrUpdateRecord(recordId, {
          company: row.Company,
          interviewer: row.Interviewer,
          interviewer_email: row['Interviewer Email'],
          candidate: row.Candidate,
          candidate_email: row['Candidate Email'],
          round_name: round.roundName,
          round_link: null,
          added_on_raw: row['Added On'],
          added_on_parsed: toISOString(addedOnDate),
          mail_status: 'skipped',
          failure_reason: 'no_scheduling_link',
          processed: false,
          idempotency_key: idempotencyKey
        });
        result.emailsSkipped++;
        continue;
      }

      // Check if quota exhausted from previous iteration
      if (quotaExhausted) {
        console.log(`  QUEUED:  ${round.roundName}: Queued (quota exhausted)`);
        await createOrUpdateRecord(recordId, {
          company: row.Company,
          interviewer: row.Interviewer,
          interviewer_email: row['Interviewer Email'],
          candidate: row.Candidate,
          candidate_email: row['Candidate Email'],
          round_name: round.roundName,
          round_link: finalRoundLink,
          added_on_raw: row['Added On'],
          added_on_parsed: toISOString(addedOnDate),
          mail_status: 'queued',
          failure_reason: 'quota_exhausted',
          processed: false,
          idempotency_key: idempotencyKey
        });
        result.emailsQueued++;
        continue;
      }

      // Send email
      console.log(`  Sending email for ${round.roundName}: Sending email to ${row['Candidate Email']}...`);

      const emailResult = await sendInvitationEmail({
        to: row['Candidate Email'],
        candidateName: row.Candidate,
        company: row.Company,
        interviewer: row.Interviewer,
        roundName: round.roundName,
        roundLink: finalRoundLink!,
        idempotencyKey
      });

      const mailSentAt = new Date();

      if (emailResult.success) {
        // Calculate TAT
        const tat = calculateTAT(mailSentAt, addedOnDate);

        // Handle future date
        let finalTat = tat;
        let failureReason = undefined;
        if (isInFuture(addedOnDate)) {
          finalTat = 0;
          failureReason = 'added_on_in_future';
        }

        tatValues.push(finalTat);

        console.log(`  SUCCESS: ${round.roundName}: Email sent (TAT: ${finalTat}s)`);

        await createOrUpdateRecord(recordId, {
          company: row.Company,
          interviewer: row.Interviewer,
          interviewer_email: row['Interviewer Email'],
          candidate: row.Candidate,
          candidate_email: row['Candidate Email'],
          round_name: round.roundName,
          round_link: finalRoundLink,
          added_on_raw: row['Added On'],
          added_on_parsed: toISOString(addedOnDate),
          mail_sent_at: toISOString(mailSentAt),
          mail_status: 'sent',
          failure_reason: failureReason,
          tat_seconds: finalTat,
          processed: true,
          idempotency_key: idempotencyKey
        });

        result.emailsSent++;
      } else {
        // Email failed
        console.log(`  FAILED: ${round.roundName}: Email failed: ${emailResult.error}`);

        if (emailResult.error === 'quota_exhausted') {
          quotaExhausted = true;
          await createOrUpdateRecord(recordId, {
            company: row.Company,
            interviewer: row.Interviewer,
            interviewer_email: row['Interviewer Email'],
            candidate: row.Candidate,
            candidate_email: row['Candidate Email'],
            round_name: round.roundName,
            round_link: finalRoundLink,
            added_on_raw: row['Added On'],
            added_on_parsed: toISOString(addedOnDate),
            mail_status: 'queued',
            failure_reason: 'quota_exhausted',
            processed: false,
            idempotency_key: idempotencyKey
          });
          result.emailsQueued++;
        } else {
          await createOrUpdateRecord(recordId, {
            company: row.Company,
            interviewer: row.Interviewer,
            interviewer_email: row['Interviewer Email'],
            candidate: row.Candidate,
            candidate_email: row['Candidate Email'],
            round_name: round.roundName,
            round_link: finalRoundLink,
            added_on_raw: row['Added On'],
            added_on_parsed: toISOString(addedOnDate),
            mail_status: 'failed',
            failure_reason: emailResult.error,
            processed: false,
            idempotency_key: idempotencyKey
          });
          result.emailsFailed++;
        }
      }
    }
  }

  // Calculate average TAT
  if (tatValues.length > 0) {
    result.averageTAT = Math.round(tatValues.reduce((a, b) => a + b, 0) / tatValues.length);
  }

  return result;
}

/**
 * Create or update Airtable record
 */
async function createOrUpdateRecord(recordId: string | undefined, record: Partial<AirtableRecord>): Promise<void> {
  try {
    if (recordId) {
      await updateAirtableRecord(recordId, record);
    } else {
      await createAirtableRecord(record);
    }
  } catch (error: any) {
    console.error(`  ⚠️  Airtable error: ${error.message}`);
  }
}

/**
 * Print processing summary
 */
function printSummary(result: ProcessingResult) {
  console.log('\n' + '='.repeat(60));
  console.log('PROCESSING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total records created:  ${result.totalRecords}`);
  console.log(`Emails sent:            ${result.emailsSent}`);
  console.log(`Emails failed:          ${result.emailsFailed}`);
  console.log(`Emails skipped:         ${result.emailsSkipped}`);
  console.log(`Emails queued:          ${result.emailsQueued}`);
  console.log(`Average TAT:            ${result.averageTAT}s`);
  console.log('='.repeat(60));
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
