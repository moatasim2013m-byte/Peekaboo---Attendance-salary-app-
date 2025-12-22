
import { GoogleGenAI } from "@google/genai";
import { PayrollResult } from "../types";

export const getPayrollAudit = async (result: PayrollResult): Promise<string> => {
  // Always use { apiKey: process.env.API_KEY } for initialization
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Persona: Senior Payroll Data Engineer.
    Task: Audit this payroll dataset (Shift Logic + Overtime Engine).
    
    Processing Rules:
    - Base: 10 JD. 
    - Overtime: >9 hours work = +1.56 JD/hr.
    - Shift A: <10:30am arrival (10am start).
    - Shift C: 10:30am-12:30pm arrival (11am start).
    - Shift B: >12:30pm arrival (2pm start, 3pm Thu/Fri).
    - Penalties: 10-19m (3 JD), 20-59m (5 JD), 60m+ (10 JD).

    Executive Summary:
    - Employees: ${result.summaries.length}
    - Total OT Payout: ${result.totalOTPayout.toFixed(2)} JD
    - Total Penalties: ${result.totalPenalties.toFixed(2)} JD
    // Fixed property name from totalPayoutOwed to totalNetOwed
    - Total Net Payout: ${result.totalNetOwed.toFixed(2)} JD
    - Overtime Hours: ${result.insights.totalOTHours.toFixed(1)}
    
    Please analyze:
    1. Overtime trends: Is OT clustered around specific individuals?
    2. Shift C Frequency: Are employees avoiding Shift A for the softer 11am start?
    3. Financial Leakage: Impact of penalties vs. OT costs.
    4. Compliance: Verify the weekend shift B transition logic.

    Markdown format with tables where appropriate.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    /* Correct access to response text property (not a method) */
    return response.text || "Audit generation failed.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Audit Engine Offline.";
  }
};