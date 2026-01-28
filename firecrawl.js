import { Hono } from "hono";
import { cors } from "hono/cors";
import OpenAI from "openai";

const API_KEY = process.env.API_KEY ?? "";
const FIRECRAWL_SERVICE = process.env.FIRECRAWL_SERVICE ?? "http://localhost:3002/v2/scrape";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = new Hono();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.use("/*", cors());

app.post("/v2/scrape", async (c) => {
  const providedKey = c.req.header("x-api-key");

  if (providedKey !== API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();

  const firecrawlBody = {
    ...body,
    formats: body.formats?.filter((format) => typeof format === "string") || ["markdown"],
  };

  const response = await fetch(FIRECRAWL_SERVICE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(firecrawlBody),
  });

  const result = await response.json();

  if (!result.success || !body.formats) {
    return c.json(result);
  }

  const jsonFormat = body.formats.find(
      (format) => typeof format === "object" && format.type === "json" && format.schema
  );

  if (!jsonFormat) {
    return c.json(result);
  }

  try {
    const markdown = result.data?.markdown || "";
    const metadata = result.data?.metadata || {};
    const prompt = jsonFormat.prompt || "Extrae la información según el schema proporcionado.";
    const schema = jsonFormat.schema;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Eres un asistente que extrae información estructurada de documentos. Responde SOLO con el JSON solicitado, sin texto adicional."
        },
        {
          role: "user",
          content: `${prompt}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}\n\nContenido del documento:\n\n${markdown}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extraction",
          strict: true,
          schema: {
            ...schema,
            additionalProperties: false
          }
        }
      }
    });

    const extracted = JSON.parse(completion.choices[0].message.content || "{}");

    return c.json({
      ...result,
      data: {
        ...result.data,
        json: extracted
      }
    });

  } catch (error) {
    console.error("Error en extracción con OpenAI:", error);

    return c.json({
      ...result,
      data: {
        ...result.data,
        json: null,
        extractionError: error instanceof Error ? error.message : "Error desconocido"
      }
    });
  }
});

Bun.serve({
  port: PORT,
  fetch: app.fetch,
});
