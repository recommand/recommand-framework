import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { zodValidator } from "../lib/zod-validator";

/**
 * Posts a body to a route validated by `zodValidator` and returns the answer
 * the way a client sees it. The validator is the only thing under test, so the
 * handler is never reached for the bodies used here.
 */
async function post(schema: z.ZodType, body: unknown) {
  const app = new Hono().post("/", zodValidator("json", schema), (c) =>
    c.json({ success: true })
  );
  const response = await app.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

const invoiceVariant = z.object({
  documentType: z.literal("invoice"),
  document: z.object({ invoiceNumber: z.string() }),
});

const creditNoteVariant = z.object({
  documentType: z.literal("creditNote"),
  document: z.object({ creditNoteNumber: z.string() }),
});

describe("zodValidator", () => {
  test("answers a field error with the shared failure shape", async () => {
    const schema = z.object({ recipient: z.string() });
    const { status, body } = await post(schema, {});

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors.recipient).toEqual(["recipient: Required"]);
    expect(body.invalidInputDetails).toEqual([
      { path: "recipient", message: "Required" },
    ]);
  });

  test("keys a nested error by its full path", async () => {
    const schema = z.object({
      document: z.object({ invoiceNumber: z.string() }),
    });
    const { body } = await post(schema, { document: {} });

    expect(body.errors["document.invoiceNumber"]).toEqual([
      "document.invoiceNumber: Required",
    ]);
    expect(body.invalidInputDetails).toEqual([
      { path: "document.invoiceNumber", message: "Required" },
    ]);
  });

  test("reports the errors of the variant the discriminator selects", async () => {
    const schema = z.discriminatedUnion("documentType", [
      invoiceVariant,
      creditNoteVariant,
    ]);
    const { body } = await post(schema, {
      documentType: "invoice",
      document: {},
    });

    expect(body.success).toBe(false);
    expect(body.errors["document.invoiceNumber"]).toEqual([
      "document.invoiceNumber: Required",
    ]);
    expect(body.errors["document.creditNoteNumber"]).toBeUndefined();
  });

  test("names the accepted values for an unknown discriminator", async () => {
    const schema = z.discriminatedUnion("documentType", [
      invoiceVariant,
      creditNoteVariant,
    ]);
    const { body } = await post(schema, {
      documentType: "purchaseOrder",
      document: {},
    });

    expect(body.success).toBe(false);
    expect(body.errors.documentType).toEqual([
      'documentType: Invalid discriminator value, accepted values are: "invoice", "creditNote".',
    ]);
  });

  test("reports the matching variant of a plain union of variants", async () => {
    const schema = z.union([invoiceVariant, creditNoteVariant]);
    const { body } = await post(schema, {
      documentType: "invoice",
      document: {},
    });

    expect(body.errors["document.invoiceNumber"]).toEqual([
      "document.invoiceNumber: Required",
    ]);
    expect(body.errors["document.creditNoteNumber"]).toBeUndefined();
    // The other variants stay available for a client that wants to see why
    // they were not a match either.
    expect(body.invalidInputDetails[0].unionErrors).toHaveLength(2);
  });

  test("names the accepted values of a plain union of variants", async () => {
    const schema = z.union([invoiceVariant, creditNoteVariant]);
    const { body } = await post(schema, {
      documentType: "purchaseOrder",
      document: {},
    });

    expect(body.errors.documentType).toEqual([
      'documentType: Invalid discriminator value, accepted values are: "invoice", "creditNote".',
    ]);
  });

  test("keeps the generic message for a union without a discriminator", async () => {
    const schema = z.object({
      teamId: z.union([z.string(), z.array(z.string())]),
    });
    const { body } = await post(schema, { teamId: 1 });

    expect(body.errors.teamId).toEqual([
      "Invalid union, make sure your input is consistent with one of the possible types for teamId.",
    ]);
    expect(body.invalidInputDetails[0].unionErrors).toHaveLength(2);
  });
});
