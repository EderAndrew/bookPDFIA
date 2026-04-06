import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export interface ChunkEmbedding {
  chunk: string;
  embedding: number[];
}

@Injectable()
export class AiService {
  private readonly client: OpenAI;
  private readonly model = 'text-embedding-3-small';

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<ChunkEmbedding[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    return response.data.map((item, index) => ({
      chunk: texts[index],
      embedding: item.embedding,
    }));
  }
}
