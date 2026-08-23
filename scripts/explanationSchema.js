/**
 * Shape of a generated lecture explanation.
 *
 * Two things live here:
 *
 *  1. EXPLANATION_JSON_SCHEMA -- the contract handed to the Claude API as a
 *     structured output. The API enforces it, so the pipeline never has to
 *     parse-and-hope, and malformed JSON stops being a failure mode.
 *
 *  2. buildStoredExplanation() -- wraps the model's output with metadata the
 *     script knows and the model does not (source URL, real timestamp, which
 *     extraction path was used). Deliberately NOT part of the model's schema:
 *     asking a model for today's date invites it to invent one.
 */

/** Status values allowed by the resources_processing_status_check constraint. */
export const STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  UNSUPPORTED: "unsupported",
};

/** How the source was handed to the model. */
export const EXTRACTION = {
  TEXT: "text", // Google Doc exported as plain text
  PDF_NATIVE: "pdf_native", // PDF passed straight to the API, images and all
};

/** Where the material came from. */
export const SOURCE_KIND = {
  GOOGLE_DOC: "google_doc",
  GOOGLE_SLIDES: "google_slides",
  DRIVE_FILE: "drive_file",
};

/**
 * Sentinel the model returns instead of inventing content when a document is
 * illegible, blank, or plainly not a lecture. The pipeline treats a response
 * carrying this as a failure rather than storing it.
 */
export const UNREADABLE_MARKER = "UNREADABLE_SOURCE";

const stringArray = (description) => ({
  type: "array",
  description,
  items: { type: "string" },
});

export const EXPLANATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "introduction",
    "learning_objectives",
    "sections",
    "overall_key_points",
  ],
  properties: {
    title: {
      type: "string",
      description:
        "The lecture's title, taken from the document itself where present.",
    },
    introduction: {
      type: "string",
      description:
        "A few sentences orienting the student: what this lecture covers and why it matters to a physiotherapist.",
    },
    learning_objectives: stringArray(
      "What a student should be able to do after reading. Concrete and checkable, not vague aims."
    ),
    sections: {
      type: "array",
      description:
        "The lecture broken into teaching sections, following the source's own order.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "content",
          "important_terms",
          "examples",
          "clinical_relevance",
          "key_points",
          "exam_focus",
        ],
        properties: {
          title: { type: "string" },
          content: {
            type: "string",
            description:
              "The full explanation for this section. Expand terse slide bullets into complete prose that teaches the idea. Never compress the source -- this should almost always be longer than what it came from.",
          },
          important_terms: {
            type: "array",
            description:
              "Terms a student would stumble on, defined in plain English.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["term", "definition"],
              properties: {
                term: { type: "string" },
                definition: { type: "string" },
              },
            },
          },
          examples: stringArray(
            "Real, applicable examples -- a patient presentation, a clinic or ward scenario, something met on placement. Not abstract restatements of the definition."
          ),
          clinical_relevance: {
            type: "string",
            description:
              "How this shows up in actual physiotherapy practice. Empty string if the section genuinely has none.",
          },
          key_points: stringArray("The things to remember from this section."),
          exam_focus: stringArray(
            "What is most likely to be examined here, and in what form."
          ),
        },
      },
    },
    overall_key_points: stringArray(
      "The whole lecture distilled -- what a student should retain if they remember nothing else."
    ),
  },
};

/**
 * Attach script-known metadata to the model's output.
 *
 * @param {object} modelOutput  Parsed response matching EXPLANATION_JSON_SCHEMA.
 * @param {object} meta
 * @param {string} meta.sourceUrl          Original Drive/Docs link.
 * @param {string} meta.extractionMethod   One of EXTRACTION.
 * @param {string} meta.sourceKind         One of SOURCE_KIND.
 * @param {number} [meta.version]          Explanation version, defaults to 1.
 * @param {string} [meta.model]            Model id that produced it.
 */
export function buildStoredExplanation(modelOutput, meta) {
  return {
    ...modelOutput,
    generated_metadata: {
      source_pdf: meta.sourceUrl,
      date_generated: new Date().toISOString(),
      version: meta.version ?? 1,
      extraction_method: meta.extractionMethod,
      source_kind: meta.sourceKind,
      model: meta.model ?? null,
    },
  };
}

/**
 * Structural validation is handled by the API, so this only catches responses
 * that are schema-valid but useless -- an empty shell, or the model telling us
 * it could not read the document.
 *
 * @returns {string|null} Reason to reject, or null if the explanation is sound.
 */
export function findSemanticProblem(explanation) {
  if (!explanation || typeof explanation !== "object") {
    return "Response was not an object.";
  }

  if (!explanation.title?.trim()) {
    return "Explanation has no title.";
  }

  if (!Array.isArray(explanation.sections) || explanation.sections.length === 0) {
    return "Explanation has no sections.";
  }

  const unreadable = explanation.sections.find((section) =>
    section?.title?.includes(UNREADABLE_MARKER)
  );

  if (unreadable) {
    return `Model could not read the source: ${
      unreadable.content?.slice(0, 300) || "no detail given"
    }`;
  }

  const hasContent = explanation.sections.some(
    (section) => section?.content?.trim().length > 40
  );

  if (!hasContent) {
    return "Every section came back effectively empty.";
  }

  return null;
}
