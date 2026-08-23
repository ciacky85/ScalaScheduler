'use server';

/**
 * @fileOverview Generates a user-friendly error report for Google Calendar export failures using GenAI.
 *
 * - generateExportErrorReport - A function that takes an array of error messages and returns a summarized report.
 * - GenerateExportErrorReportInput - The input type for the generateExportErrorReport function.
 * - GenerateExportErrorReportOutput - The return type for the generateExportErrorReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateExportErrorReportInputSchema = z.array(z.string()).describe('An array of error messages from the Google Calendar export process.');
export type GenerateExportErrorReportInput = z.infer<typeof GenerateExportErrorReportInputSchema>;

const GenerateExportErrorReportOutputSchema = z.string().describe('A summarized, user-friendly report of the errors encountered during the Google Calendar export process.');
export type GenerateExportErrorReportOutput = z.infer<typeof GenerateExportErrorReportOutputSchema>;

export async function generateExportErrorReport(errors: GenerateExportErrorReportInput): Promise<GenerateExportErrorReportOutput> {
  return generateExportErrorReportFlow(errors);
}

const generateExportErrorReportPrompt = ai.definePrompt({
  name: 'generateExportErrorReportPrompt',
  input: {schema: GenerateExportErrorReportInputSchema},
  output: {schema: GenerateExportErrorReportOutputSchema},
  prompt: `You are an expert in debugging Google Calendar export processes.
  Based on the following error messages, provide a concise, user-friendly report that helps the user quickly identify and debug the issues.
  Focus on summarizing the errors and suggesting potential solutions.

  Error messages:
  {{#each this}}
  - {{{this}}}
  {{/each}}
  `,
});

const generateExportErrorReportFlow = ai.defineFlow(
  {
    name: 'generateExportErrorReportFlow',
    inputSchema: GenerateExportErrorReportInputSchema,
    outputSchema: GenerateExportErrorReportOutputSchema,
  },
  async errors => {
    const {output} = await generateExportErrorReportPrompt(errors);
    return output!;
  }
);
