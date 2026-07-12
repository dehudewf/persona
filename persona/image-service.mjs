import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export function buildCharacterPrompt(person, options = {}) {
  const style = options.style || "editorial illustration";
  const traits = person.traits.slice(0, 5).join(", ") || "thoughtful and observant";
  const cares = person.cares.slice(0, 3).join(", ") || "clear communication and respect";
  return [
    `Create a fictional adult character concept in ${style} style.`,
    `Personality inspiration: ${traits}. Values and priorities: ${cares}.`,
    "Use symbolic color, setting, clothing, and objects to express the personality.",
    "Do not infer or reproduce the real person's face, body, ethnicity, disability, or other sensitive attributes.",
    "Age-appropriate, non-sexual, respectful, no appearance ranking, no text in the image."
  ].join(" ");
}

export async function generateCharacterImage(person, options = {}) {
  const prompt = buildCharacterPrompt(person, options);
  if (!process.env.OPENAI_API_KEY) {
    return { provider: "prompt-only", status: "prompt_ready", prompt, fileName: null };
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    size: "1024x1024"
  });
  const image = response.data?.[0];
  if (!image?.b64_json) throw new Error("图片服务没有返回可保存的图片数据");
  const fileName = `${person.id}-${randomUUID()}.png`;
  const directory = resolve("data/generated");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, fileName), Buffer.from(image.b64_json, "base64"));
  return { provider: "openai", status: "completed", prompt, fileName };
}
