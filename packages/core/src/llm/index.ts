import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createCohere } from '@ai-sdk/cohere';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import {
  CoreMessage,
  CoreTool as CT,
  generateObject,
  generateText,
  LanguageModelV1,
  streamObject,
  streamText,
  tool,
} from 'ai';
import { createAnthropicVertex } from 'anthropic-vertex-ai';
import { z, ZodSchema } from 'zod';

import { ToolsInput } from '../agent/types';
import { MastraBase } from '../base';
import { LogLevel, RegisteredLogger } from '../logger';
import { Run } from '../run/types';
import { InstrumentClass } from '../telemetry/telemetry.decorators';
import { CoreTool } from '../tools/types';
import { delay } from '../utils';

import {
  CustomModelConfig,
  GenerateReturn,
  GoogleGenerativeAISettings,
  LLMProvider,
  ModelConfig,
  StructuredOutput,
  StructuredOutputType,
} from './types';

@InstrumentClass({
  prefix: 'llm',
  excludeMethods: ['__setTools', '__setLogger', '__setTelemetry', '#log'],
})
export class LLM extends MastraBase {
  #model: ModelConfig;

  constructor({ model }: { model: ModelConfig }) {
    super({
      component: RegisteredLogger.LLM,
    });
    this.#model = model;
  }

  getModelType(): string {
    const model = this.#model;

    if (!('provider' in model)) {
      throw new Error('Model provider is required');
    }
    const providerToType: Record<LLMProvider, string> = {
      OPEN_AI: 'openai',
      ANTHROPIC: 'anthropic',
      GROQ: 'groq',
      PERPLEXITY: 'perplexity',
      FIREWORKS: 'fireworks',
      TOGETHER_AI: 'togetherai',
      LM_STUDIO: 'lmstuido',
      BASETEN: 'baseten',
      GOOGLE: 'google',
      MISTRAL: 'mistral',
      X_GROK: 'grok',
      COHERE: 'cohere',
      AZURE: 'azure',
      AMAZON: 'amazon',
      //
      ANTHROPIC_VERTEX: 'anthropic-vertex',
    };
    const type = providerToType[model.provider as LLMProvider] ?? model.provider;

    this.log(LogLevel.DEBUG, `Model type resolved to ${type} for provider ${model.provider}`);

    return type;
  }

  createOpenAICompatibleModel({
    baseURL,
    apiKey,
    defaultModelName,
    modelName,
    fetch,
  }: {
    baseURL: string;
    apiKey: string;
    defaultModelName: string;
    modelName?: string;
    fetch?: typeof globalThis.fetch;
  }): LanguageModelV1 {
    this.log(LogLevel.DEBUG, `Creating OpenAI compatible model with baseURL: ${baseURL}`);
    const client = createOpenAI({
      baseURL,
      apiKey,
      fetch,
    });
    return client(modelName || defaultModelName);
  }

  createModelDef({
    model,
  }: {
    model: {
      type: string;
      name?: string;
      toolChoice?: 'auto' | 'required';
      baseURL?: string;
      fetch?: typeof globalThis.fetch;
      apiKey?: string;
    };
  }): LanguageModelV1 {
    let modelDef: LanguageModelV1;
    if (model.type === 'openai') {
      this.log(LogLevel.DEBUG, `Initializing OpenAI model ${model.name || 'gpt-4o-2024-08-06'}`);
      const openai = createOpenAI({
        apiKey: model?.apiKey || process.env.OPENAI_API_KEY,
      });
      modelDef = openai(model.name || 'gpt-4o-2024-08-06', {
        structuredOutputs: true,
      });
    } else if (model.type === 'anthropic') {
      this.log(LogLevel.DEBUG, `Initializing Anthropic model ${model.name || 'claude-3-5-sonnet-20240620'}`);
      const anthropic = createAnthropic({
        apiKey: model?.apiKey || process.env.ANTHROPIC_API_KEY,
      });
      modelDef = anthropic(model.name || 'claude-3-5-sonnet-20240620');
    } else if (model.type === 'google') {
      this.log(LogLevel.DEBUG, `Initializing Google model ${model.name || 'gemini-1.5-pro-latest'}`);
      const google = createGoogleGenerativeAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: model?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
      });
      modelDef = google(model.name || 'gemini-1.5-pro-latest');
    } else if (model.type === 'groq') {
      this.log(LogLevel.DEBUG, `Initializing Groq model ${model.name || 'llama-3.2-90b-text-preview'}`);
      modelDef = this.createOpenAICompatibleModel({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: model?.apiKey || process.env.GROQ_API_KEY || '',
        defaultModelName: 'llama-3.2-90b-text-preview',
        modelName: model.name,
      });
    } else if (model.type === 'perplexity') {
      this.log(LogLevel.DEBUG, `Initializing Perplexity model ${model.name || 'llama-3.1-sonar-large-128k-chat'}`);
      modelDef = this.createOpenAICompatibleModel({
        baseURL: 'https://api.perplexity.ai/',
        apiKey: model?.apiKey || process.env.PERPLEXITY_API_KEY || '',
        defaultModelName: 'llama-3.1-sonar-large-128k-chat',
        modelName: model.name,
      });
    } else if (model.type === 'fireworks') {
      this.log(LogLevel.DEBUG, `Initializing Fireworks model ${model.name || 'llama-v3p1-70b-instruct'}`);
      modelDef = this.createOpenAICompatibleModel({
        baseURL: 'https://api.fireworks.ai/inference/v1',
        apiKey: model?.apiKey || process.env.FIREWORKS_API_KEY || '',
        defaultModelName: 'llama-v3p1-70b-instruct',
        modelName: model.name,
      });
    } else if (model.type === 'togetherai') {
      this.log(LogLevel.DEBUG, `Initializing TogetherAI model ${model.name || 'google/gemma-2-9b-it'}`);
      modelDef = this.createOpenAICompatibleModel({
        baseURL: 'https://api.together.xyz/v1/',
        apiKey: model?.apiKey || process.env.TOGETHER_AI_API_KEY || '',
        defaultModelName: 'google/gemma-2-9b-it',
        modelName: model.name,
      });
    } else if (model.type === 'lmstudio') {
      this.log(LogLevel.DEBUG, `Initializing LMStudio model ${model.name || 'llama-3.2-1b'}`);

      if (!model?.baseURL) {
        const error = `LMStudio model requires a baseURL`;
        this.logger.error(error);
        throw new Error(error);
      }
      modelDef = this.createOpenAICompatibleModel({
        baseURL: model.baseURL,
        apiKey: 'not-needed',
        defaultModelName: 'llama-3.2-1b',
        modelName: model.name,
      });
    } else if (model.type === 'baseten') {
      this.log(LogLevel.DEBUG, `Initializing BaseTen model ${model.name || 'llama-3.1-70b-instruct'}`);
      if (model?.fetch) {
        const error = `Custom fetch is required to use ${model.type}. see https://docs.baseten.co/api-reference/openai for more information`;
        this.logger.error(error);
        throw new Error(error);
      }
      modelDef = this.createOpenAICompatibleModel({
        baseURL: 'https://bridge.baseten.co/v1/direct',
        apiKey: model?.apiKey || process.env.BASETEN_API_KEY || '',
        defaultModelName: 'llama-3.1-70b-instruct',
        modelName: model.name,
      });
    } else if (model.type === 'mistral') {
      this.log(LogLevel.DEBUG, `Initializing Mistral model ${model.name || 'pixtral-large-latest'}`);
      const mistral = createMistral({
        baseURL: 'https://api.mistral.ai/v1',
        apiKey: model?.apiKey || process.env.MISTRAL_API_KEY || '',
      });

      modelDef = mistral(model.name || 'pixtral-large-latest');
    } else if (model.type === 'grok') {
      this.log(LogLevel.DEBUG, `Initializing X Grok model ${model.name || 'grok-beta'}`);
      const xAi = createXai({
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY ?? '',
      });

      modelDef = xAi(model.name || 'grok-beta');
    } else if (model.type === 'cohere') {
      this.log(LogLevel.DEBUG, `Initializing Cohere model ${model.name || 'command-r-plus'}`);
      const cohere = createCohere({
        baseURL: 'https://api.cohere.com/v2',
        apiKey: model?.apiKey || process.env.COHERE_API_KEY || '',
      });

      modelDef = cohere(model.name || 'command-r-plus');
    } else if (model.type === 'azure') {
      this.log(LogLevel.DEBUG, `Initializing Azure model ${model.name || 'gpt-35-turbo-instruct'}`);
      const azure = createAzure({
        resourceName: process.env.AZURE_RESOURCE_NAME || '',
        apiKey: model?.apiKey || process.env.AZURE_API_KEY || '',
      });
      modelDef = azure(model.name || 'gpt-35-turbo-instruct');
    } else if (model.type === 'amazon') {
      this.log(LogLevel.DEBUG, `Initializing Amazon model ${model.name || 'amazon-titan-tg1-large'}`);
      const amazon = createAmazonBedrock({
        region: process.env.AWS_REGION || '',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        sessionToken: process.env.AWS_SESSION_TOKEN || '',
      });
      modelDef = amazon(model.name || 'amazon-titan-tg1-large');
    } else if (model.type === 'anthropic-vertex') {
      this.log(LogLevel.DEBUG, `Initializing Anthropic Vertex model ${model.name || 'claude-3-5-sonnet@20240620'}`);
      const anthropicVertex = createAnthropicVertex({
        region: process.env.GOOGLE_VERTEX_REGION,
        projectId: process.env.GOOGLE_VERTEX_PROJECT_ID,
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      });
      modelDef = anthropicVertex(model.name || 'claude-3-5-sonnet@20240620');
    } else {
      const error = `Invalid model type: ${model.type}`;
      this.logger.error(error);
      throw new Error(error);
    }

    return modelDef;
  }

  async getParams({
    tools,
    resultTool,
    model,
  }: {
    tools: Record<string, CoreTool>;
    resultTool?: { description: string; parameters: ZodSchema };
    model:
      | ({
          type: string;
          name?: string;
          toolChoice?: 'auto' | 'required';
          baseURL?: string;
          apiKey?: string;
          fetch?: typeof globalThis.fetch;
        } & GoogleGenerativeAISettings)
      | CustomModelConfig;
  }) {
    const toolsConverted = Object.entries(tools).reduce(
      (memo, [key, val]) => {
        memo[key] = tool(val);
        return memo;
      },
      {} as Record<string, CT>,
    );

    let answerTool = {};
    if (resultTool) {
      answerTool = { answer: tool(resultTool) };
    }

    let modelDef;

    if ('type' in model) {
      modelDef = this.createModelDef({ model });
    } else {
      if (model.model instanceof Function) {
        modelDef = await model.model();
      } else {
        modelDef = model.model;
      }
    }

    return {
      toolsConverted,
      modelDef,
      answerTool,
      toolChoice: model.toolChoice || 'auto',
    };
  }

  convertTools(tools?: ToolsInput): Record<string, CoreTool> {
    this.log(LogLevel.DEBUG, 'Starting tool conversion for LLM');
    const converted = Object.entries(tools || {}).reduce(
      (memo, value) => {
        const k = value[0] as string;
        const tool = value[1];

        if (tool) {
          memo[k] = {
            description: tool.description!,
            parameters: tool.inputSchema,
            execute: async props => {
              this.log(LogLevel.DEBUG, 'Executing tool', {
                tool: k,
                props,
              });
              return tool.execute({
                context: props,
              });
            },
          };
        }
        return memo;
      },
      {} as Record<string, CoreTool>,
    );

    this.log(LogLevel.DEBUG, `Converted tools for LLM`);
    return converted;
  }

  private isBaseOutputType(outputType: StructuredOutputType) {
    return outputType === 'string' || outputType === 'number' || outputType === 'boolean' || outputType === 'date';
  }

  private baseOutputTypeSchema(outputType: StructuredOutputType) {
    switch (outputType) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'date':
        return z.string().describe('ISO 8601 date string');
      default:
        return z.string();
    }
  }

  private createOutputSchema(output: StructuredOutput) {
    const schema = Object.entries(output).reduce(
      (memo, [k, v]) => {
        if (this.isBaseOutputType(v.type)) {
          memo[k] = this.baseOutputTypeSchema(v.type);
        }
        if (v.type === 'object') {
          const objectItem = v.items;
          const objectItemSchema = this.createOutputSchema(objectItem);

          memo[k] = objectItemSchema;
        }
        if (v.type === 'array') {
          const arrayItem = v.items;
          if (this.isBaseOutputType(arrayItem.type)) {
            const itemSchema = this.baseOutputTypeSchema(arrayItem.type);
            memo[k] = z.array(itemSchema);
          }

          if (arrayItem.type === 'object') {
            const objectInArrayItemSchema = this.createOutputSchema(arrayItem.items);
            memo[k] = z.array(objectInArrayItemSchema);
          }
        }
        return memo;
      },
      {} as Record<string, any>,
    );

    return z.object(schema);
  }

  async generate<S extends boolean = false, Z extends ZodSchema | undefined = undefined>(
    messages: string | string[] | CoreMessage[],
    {
      schema,
      stream,
      maxSteps = 5,
      onFinish,
      onStepFinish,
      tools,
      convertedTools,
      runId,
    }: {
      runId?: string;
      stream?: S;
      schema?: Z;
      onFinish?: (result: string) => Promise<void> | void;
      onStepFinish?: (step: string) => void;
      maxSteps?: number;
      tools?: ToolsInput;
      convertedTools?: Record<string, CoreTool>;
    } = {},
  ): Promise<GenerateReturn<S, Z>> {
    let msgs;
    if (Array.isArray(messages)) {
      msgs = messages?.map(m => {
        if (typeof m === 'string') {
          return {
            role: 'user',
            content: m,
          };
        }
        return m;
      });
    } else {
      msgs = [
        {
          role: 'user',
          content: messages,
        },
      ];
    }

    if (stream && schema) {
      return (await this.__streamObject({
        messages: msgs as CoreMessage[],
        structuredOutput: schema,
        onStepFinish,
        onFinish,
        maxSteps,
        tools,
        convertedTools,
        runId,
      })) as unknown as GenerateReturn<S, Z>;
    }

    if (stream) {
      return (await this.__stream({
        messages: msgs as CoreMessage[],
        onStepFinish,
        onFinish,
        maxSteps,
        tools,
        convertedTools,
        runId,
      })) as unknown as GenerateReturn<S, Z>;
    }

    if (schema) {
      return (await this.__textObject({
        messages: msgs as CoreMessage[],
        structuredOutput: schema,
        onStepFinish,
        maxSteps,
        tools,
        convertedTools,
        runId,
      })) as unknown as GenerateReturn<S, Z>;
    }

    return (await this.__text({
      messages: msgs as CoreMessage[],
      onStepFinish,
      maxSteps,
      tools,
      convertedTools,
      runId,
    })) as unknown as GenerateReturn<S, Z>;
  }

  async __text({
    messages,
    onStepFinish,
    maxSteps = 5,
    tools,
    runId,
    convertedTools,
  }: {
    tools?: ToolsInput;
    convertedTools?: Record<string, CoreTool>;
    messages: CoreMessage[];
    onStepFinish?: (step: string) => void;
    maxSteps?: number;
  } & Run) {
    const model = this.#model;
    this.log(LogLevel.DEBUG, `Generating text with ${messages.length} messages`, { runId });
    let modelToPass;

    if ('name' in model) {
      modelToPass = {
        type: this.getModelType(),
        name: model.name,
        toolChoice: model.toolChoice,
        apiKey: model.provider !== 'LM_STUDIO' ? model?.apiKey : undefined,
        baseURL: model.provider === 'LM_STUDIO' ? model.baseURL : undefined,
        fetch: model.provider === 'BASETEN' ? model.fetch : undefined,
      };
    } else {
      modelToPass = model;
    }

    const params = await this.getParams({
      tools: convertedTools || this.convertTools(tools),
      model: modelToPass,
    });

    const argsForExecute = {
      model: params.modelDef,
      tools: {
        ...params.toolsConverted,
        ...params.answerTool,
      },
      toolChoice: params.toolChoice,
      maxSteps,
      onStepFinish: async (props: any) => {
        onStepFinish?.(JSON.stringify(props, null, 2));
        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds');
          await delay(10 * 1000);
        }
      },
    };

    return await generateText({
      messages,
      ...argsForExecute,
      experimental_telemetry: this.experimental_telemetry,
    });
  }

  async __textObject({
    messages,
    onStepFinish,
    maxSteps = 5,
    tools,
    convertedTools,
    structuredOutput,
    runId,
  }: {
    structuredOutput: StructuredOutput | ZodSchema;
    tools?: ToolsInput;
    convertedTools?: Record<string, CoreTool>;
    messages: CoreMessage[];
    onStepFinish?: (step: string) => void;
    maxSteps?: number;
  } & Run) {
    const model = this.#model;
    this.log(LogLevel.DEBUG, `Generating text with ${messages.length} messages`, { runId });
    let modelToPass;

    if ('name' in model) {
      modelToPass = {
        type: this.getModelType(),
        name: model.name,
        toolChoice: model.toolChoice,
        apiKey: model.provider !== 'LM_STUDIO' ? model?.apiKey : undefined,
        baseURL: model.provider === 'LM_STUDIO' ? model.baseURL : undefined,
        fetch: model.provider === 'BASETEN' ? model.fetch : undefined,
      };
    } else {
      modelToPass = model;
    }

    const params = await this.getParams({
      tools: convertedTools || this.convertTools(tools),
      model: modelToPass,
    });

    const argsForExecute = {
      model: params.modelDef,
      tools: {
        ...params.toolsConverted,
        ...params.answerTool,
      },
      toolChoice: params.toolChoice,
      maxSteps,
      onStepFinish: async (props: any) => {
        onStepFinish?.(JSON.stringify(props, null, 2));
        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds', runId);
          await delay(10 * 1000);
        }
      },
    };

    let schema: ZodSchema;
    let output = 'object';

    if (typeof (structuredOutput as any).parse === 'function') {
      schema = structuredOutput as ZodSchema;
      if (schema instanceof z.ZodArray) {
        output = 'array';
        schema = schema._def.type;
      }
    } else {
      schema = this.createOutputSchema(structuredOutput as StructuredOutput);
    }

    return await generateObject({
      messages,
      ...argsForExecute,
      output: output as any,
      schema,
      experimental_telemetry: this.experimental_telemetry,
    });
  }

  async __stream({
    messages,
    onStepFinish,
    onFinish,
    maxSteps = 5,
    tools,
    runId,
    convertedTools,
  }: {
    tools?: ToolsInput;
    convertedTools?: Record<string, CoreTool>;
    messages: CoreMessage[];
    onStepFinish?: (step: string) => void;
    onFinish?: (result: string) => Promise<void> | void;
    maxSteps?: number;
  } & Run) {
    const model = this.#model;
    this.log(LogLevel.DEBUG, `Streaming text with ${messages.length} messages`, { runId });
    let modelToPass;
    if ('name' in model) {
      modelToPass = {
        type: this.getModelType(),
        name: model.name,
        toolChoice: model.toolChoice,
        apiKey: model.provider !== 'LM_STUDIO' ? model?.apiKey : undefined,
        baseURL: model.provider === 'LM_STUDIO' ? model.baseURL : undefined,
        fetch: model.provider === 'BASETEN' ? model.fetch : undefined,
      };
    } else {
      modelToPass = model;
    }

    const params = await this.getParams({
      tools: convertedTools || this.convertTools(tools),
      model: modelToPass,
    });

    const argsForExecute = {
      model: params.modelDef,
      tools: {
        ...params.toolsConverted,
        ...params.answerTool,
      },
      toolChoice: params.toolChoice,
      maxSteps,
      onStepFinish: async (props: any) => {
        onStepFinish?.(JSON.stringify(props, null, 2));
        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds', runId);
          await delay(10 * 1000);
        }
      },
      onFinish: async (props: any) => {
        onFinish?.(JSON.stringify(props, null, 2));
      },
    };

    return await streamText({
      messages,
      ...argsForExecute,
      experimental_telemetry: this.experimental_telemetry,
    });
  }

  async __streamObject({
    messages,
    onStepFinish,
    onFinish,
    maxSteps = 5,
    tools,
    convertedTools,
    structuredOutput,
    runId,
  }: {
    structuredOutput: StructuredOutput | ZodSchema;
    tools?: ToolsInput;
    convertedTools?: Record<string, CoreTool>;
    messages: CoreMessage[];
    onStepFinish?: (step: string) => void;
    onFinish?: (result: string) => Promise<void> | void;
    maxSteps?: number;
  } & Run) {
    const model = this.#model;
    this.log(LogLevel.DEBUG, `Streaming text with ${messages.length} messages`, { runId });
    let modelToPass;
    if ('name' in model) {
      modelToPass = {
        type: this.getModelType(),
        name: model.name,
        toolChoice: model.toolChoice,
        apiKey: model.provider !== 'LM_STUDIO' ? model?.apiKey : undefined,
        baseURL: model.provider === 'LM_STUDIO' ? model.baseURL : undefined,
        fetch: model.provider === 'BASETEN' ? model.fetch : undefined,
      };
    } else {
      modelToPass = model;
    }

    const params = await this.getParams({
      tools: convertedTools || this.convertTools(tools),
      model: modelToPass,
    });

    const argsForExecute = {
      model: params.modelDef,
      tools: {
        ...params.toolsConverted,
        ...params.answerTool,
      },
      toolChoice: params.toolChoice,
      maxSteps,
      onStepFinish: async (props: any) => {
        onStepFinish?.(JSON.stringify(props, null, 2));
        if (
          props?.response?.headers?.['x-ratelimit-remaining-tokens'] &&
          parseInt(props?.response?.headers?.['x-ratelimit-remaining-tokens'], 10) < 2000
        ) {
          this.logger.warn('Rate limit approaching, waiting 10 seconds', runId);
          await delay(10 * 1000);
        }
      },
      onFinish: async (props: any) => {
        onFinish?.(JSON.stringify(props, null, 2));
      },
    };

    let schema: ZodSchema;
    let output = 'object';

    if (typeof (structuredOutput as any).parse === 'function') {
      schema = structuredOutput as ZodSchema;
      if (schema instanceof z.ZodArray) {
        output = 'array';
        schema = schema._def.type;
      }
    } else {
      schema = this.createOutputSchema(structuredOutput as StructuredOutput);
    }

    return await streamObject({
      messages,
      ...argsForExecute,
      output: output as any,
      schema,
      experimental_telemetry: this.experimental_telemetry,
    });
  }
}
