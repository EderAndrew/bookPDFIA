import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export interface ChunkEmbedding {
  chunk: string;
  embedding: number[];
}

@Injectable()
export class AiService {
  private readonly client: OpenAI;
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly chatModel = 'gpt-4o';

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<ChunkEmbedding[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });

    return response.data.map((item, index) => ({
      chunk: texts[index],
      embedding: item.embedding,
    }));
  }

  async chat(context: string, question: string): Promise<string> {
    const prompt = `Você é um assistente de programação.

Responda baseado APENAS no conteúdo abaixo:
Se não encontrar a resposta, diga: "Não encontrei no material".

Conteúdo:
${context}

Pergunta:
${question}

Se possível:
- explique de forma simples
- dê exemplo de código`;

    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content ?? '';
  }
}
