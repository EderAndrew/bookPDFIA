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
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [
        {
          role: 'system',
          content: `Você é um assistente técnico especializado em programação.
Suas respostas são baseadas EXCLUSIVAMENTE nos trechos de documentação fornecidos.

Regras:
- Se a resposta não estiver nos trechos, diga exatamente: "Não encontrei essa informação na documentação enviada."
- Nunca invente ou complete com conhecimento externo
- Prefira exemplos de código quando aplicável
- Seja direto e objetivo
- Use markdown para formatar código`,
        },
        {
          role: 'user',
          content: `Trechos da documentação:
${context}

Pergunta: ${question}`,
        },
      ],
      temperature: 0.2, //baixo - respostas mais determinísticas e precisas
    });

    return response.choices[0].message.content ?? '';
  }

  async chatWithLibContext(
    context: string,
    question: string,
    libName: string,
    version: string,
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [
        {
          role: 'system',
          content: `Você é um assistente técnico especializado em programação.
Suas respostas são baseadas EXCLUSIVAMENTE nos trechos de documentação fornecidos.
A documentação é referente à biblioteca ${libName}${version ? ` na versão ${version}` : ''}.

Regras:
- Responda APENAS com base nos trechos fornecidos
- NÃO use conhecimento de outras versões da biblioteca
- Se a informação não estiver nos trechos, diga exatamente: "Não encontrei essa informação na documentação de ${libName}${version ? `@${version}` : ''}."
- Prefira exemplos de código quando aplicável
- Seja direto e objetivo
- Use markdown para formatar código`,
        },
        {
          role: 'user',
          content: `Trechos da documentação:
${context}

Pergunta: ${question}`,
        },
      ],
      temperature: 0.2,
    });

    return response.choices[0].message.content ?? '';
  }
}
