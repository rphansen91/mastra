import express, { Request, Response } from 'express';
import expressJSDocSwagger, { Options } from 'express-jsdoc-swagger';
import { join } from 'path';
import serverless from 'serverless-http';

const { mastra } = await import(join(process.cwd(), 'mastra.mjs'));

const app = express();

app.use(express.json());

// Swagger configuration
const options: Options = {
  info: {
    version: '1.0.0',
    title: 'Mastra API',
    description: 'API documentation for Mastra agent, sync, memory and workflow operations',
  },
  security: {
    BasicAuth: {
      type: 'http',
      scheme: 'basic',
    },
  },
  servers: [
    {
      url: 'http://localhost:4111',
      description: 'Local server',
    },
  ],
  baseDir: __dirname,
  filesPattern: './**/*.mjs',
  exposeSwaggerUI: false,
  exposeApiDocs: true,
  apiDocsPath: '/openapi.json',
  notRequiredAsNullable: false,
};

expressJSDocSwagger(app)(options);

interface ValidationResult {
  ok: boolean;
  errorResponse?: Record<string, string>;
}

interface ApiError extends Error {
  message: string;
  status?: number;
}

const validateBody = async (body: Record<string, unknown>): Promise<ValidationResult> => {
  const errorResponse = Object.entries(body).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!value) {
      acc[key] = `${key} is required`;
    }
    return acc;
  }, {});

  if (Object.keys(errorResponse).length > 0) {
    return { ok: false, errorResponse };
  }

  return { ok: true };
};

/**
 * GET /
 * @summary Health check endpoint
 * @tags System
 * @return {string} 200 - Health check response
 */
app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});

// Serve static files from the Vite build first
app.use(
  '/assets',
  express.static(join(__dirname, 'agent-chat/assets'), {
    setHeaders: (res: Response, path: string) => {
      // Set correct MIME types
      if (path.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript');
      } else if (path.endsWith('.css')) {
        res.set('Content-Type', 'text/css');
      }
    },
  }),
);

// Serve other static files
app.use(express.static(join(__dirname, 'agent-chat')));

/**
 * GET /agent/{agentId}
 * @summary Serve agent chat interface
 * @tags Agent
 * @param {string} agentId.path.required - Agent identifier
 * @return {html} 200 - Agent chat interface
 */
app.get('/agent/:agentId', (_req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'agent-chat/index.html'));
});

/**
 * POST /agent/{agentId}/text
 * @summary Send text messages to agent
 * @tags Agent
 * @param {string} agentId.path.required - Agent identifier
 * @param {Messages} request.body.required - Messages to send
 * @return {object} 200 - Agent response
 * @return {Error} 400 - Validation error
 * @return {Error} 500 - Server error
 */
app.post('/agent/:agentId/text', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const agent = mastra.getAgent(agentId);
    const messages = req.body.messages;
    const { ok, errorResponse } = await validateBody({
      messages,
    });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: { messages: 'Messages should be an array' } });
      return;
    }

    const result = await agent.text({ messages });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error texting from agent', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error texting from agent' });
    return;
  }
});

/**
 * POST /agent/{agentId}/stream
 * @summary Stream messages to agent
 * @tags Agent
 * @param {string} agentId.path.required - Agent identifier
 * @param {Messages} request.body.required - Messages to stream
 * @return {stream} 200 - Agent response stream
 * @return {Error} 400 - Validation error
 * @return {Error} 500 - Server error
 */
app.post('/agent/:agentId/stream', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const agent = mastra.getAgent(agentId);
    const messages = req.body.messages;
    const { ok, errorResponse } = await validateBody({
      messages,
    });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: { messages: 'Messages should be an array' } });
      return;
    }

    const streamResult = await agent.stream({
      messages,
    });

    streamResult.pipeDataStreamToResponse(res);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error streaming from agent', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error streaming from agent' });
    return;
  }
});

/**
 * POST /agent/{agentId}/text-object
 * @summary Get structured output from agent
 * @tags Agent
 * @param {string} agentId.path.required - Agent identifier
 * @param {TextObjectRequest} request.body.required - Request with messages and structured output spec
 * @return {object} 200 - Structured output response
 * @return {Error} 400 - Validation error
 * @return {Error} 500 - Server error
 */
app.post('/agent/:agentId/text-object', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const agent = mastra.getAgent(agentId);
    const messages = req.body.messages;
    const structuredOutput = req.body.structuredOutput;

    const { ok, errorResponse } = await validateBody({
      messages,
      structuredOutput,
    });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: { messages: 'Messages should be an array' } });
      return;
    }

    const result = await agent.textObject({ messages, structuredOutput });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting structured output from agent', apiError);
    res
      .status(apiError.status || 500)
      .json({ error: apiError.message || 'Error getting structured output from agent' });
    return;
  }
});

/**
 * POST /agent/{agentId}/stream-object
 * @summary Stream structured output from agent
 * @tags Agent
 * @param {string} agentId.path.required - Agent identifier
 * @param {TextObjectRequest} request.body.required - Request with messages and structured output spec
 * @return {stream} 200 - Structured output stream
 * @return {Error} 400 - Validation error
 * @return {Error} 500 - Server error
 */
app.post('/agent/:agentId/stream-object', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId;
    const agent = mastra.getAgent(agentId);
    const messages = req.body.messages;
    const structuredOutput = req.body.structuredOutput;

    const { ok, errorResponse } = await validateBody({
      messages,
      structuredOutput,
    });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: { messages: 'Messages should be an array' } });
      return;
    }

    const streamResult = await agent.streamObject({
      messages,
      structuredOutput,
    });

    streamResult.pipeTextStreamToResponse(res);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error streaming structured output from agent', apiError);
    res
      .status(apiError.status || 500)
      .json({ error: apiError.message || 'Error streaming structured output from agent' });
    return;
  }
});

/**
 * POST /workflows/{workflowId}/execute
 * @summary Execute a workflow
 * @tags Workflow
 * @param {string} workflowId.path.required - Workflow identifier
 * @param {object} request.body.required - Workflow input data
 * @return {object} 200 - Workflow execution result
 * @return {Error} 500 - Server error
 */
app.post('/workflows/:workflowId/execute', async (req: Request, res: Response) => {
  try {
    const workflowId = req.params.workflowId;
    const workflow = mastra.workflows.get(workflowId);
    const result = await workflow.execute(req.body);
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error executing workflow', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error executing workflow' });
    return;
  }
});

/**
 * GET /memory/threads/get-by-resourceid/{resourceid}
 * @summary Get threads by resource ID
 * @tags Memory
 * @param {string} resourceid.path.required - Resource identifier
 * @return {Thread[]} 200 - Array of threads
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 500 - Server error
 */
app.get('/memory/threads/get-by-resourceid/:resourceid', async (req: Request, res: Response) => {
  try {
    const resourceid = req.params.resourceid;
    const memory = mastra.memory;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }
    const threads = await memory.getThreadsByResourceId({ resourceid });
    res.json(threads);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting threads from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error getting threads from memory' });
    return;
  }
});

/**
 * GET /memory/threads/{threadId}
 * @summary Get thread by ID
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @return {Thread} 200 - Thread details
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.get('/memory/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const memory = mastra.memory;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }
    res.json(thread);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting thread from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error getting thread from memory' });
    return;
  }
});

/**
 * POST /memory/threads
 * @summary Create a new thread
 * @tags Memory
 * @param {Thread} request.body.required - Thread details
 * @return {Thread} 200 - Thread created successfully
 * @return {Error} 400 - Memory not initialized or validation error
 * @return {Error} 500 - Server error
 */
app.post('/memory/threads', async (req: Request, res: Response) => {
  try {
    const memory = mastra.memory;
    const { title, metadata, resourceid, threadId } = req.body;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const { ok, errorResponse } = await validateBody({ resourceid });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    const result = await memory.createThread({ resourceid, title, metadata, threadId });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error saving thread to memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error saving thread to memory' });
    return;
  }
});

/**
 * PATCH /memory/threads/{threadId}
 * @summary Update thread details
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @param {object} request.body - Thread update data
 * @param {string} request.body.title - Thread title
 * @param {object} request.body.metadata - Thread metadata
 * @param {string} request.body.resourceid - Resource identifier
 * @return {Thread} 200 - Updated thread
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.patch('/memory/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const memory = mastra.memory;
    const { title, metadata, resourceid } = req.body;
    const updatedAt = new Date();

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const thread = await memory.getThreadById({ threadId });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const updatedThread = {
      ...thread,
      title: title || thread.title,
      metadata: metadata || thread.metadata,
      resourceid: resourceid || thread.resourceid,
      createdAt: thread.createdat,
      updatedAt,
    };
    const result = await memory.saveThread({ thread: updatedThread });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error saving thread to memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error saving thread to memory' });
    return;
  }
});

/**
 * DELETE /memory/threads/{threadId}
 * @summary Delete a thread
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @return {object} 200 - Deletion confirmation
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.delete('/memory/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const memory = mastra.memory;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }
    const thread = await memory.getThreadById({ threadId });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    await memory.deleteThread(threadId);
    res.json({ result: 'Thread deleted' });
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error deleting thread from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error deleting thread from memory' });
    return;
  }
});

/**
 * GET /memory/threads/{threadId}/messages
 * @summary Get messages from a thread
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @return {Message[]} 200 - Array of messages
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.get('/memory/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const memory = mastra.memory;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }
    const thread = await memory.getThreadById({ threadId });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const result = await memory.getMessages({ threadId });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting messages from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error getting messages from memory' });
    return;
  }
});

/**
 * GET /memory/threads/{threadId}/context-window
 * @summary Get context window for a thread
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @param {string} startDate.query - Start date for context window
 * @param {string} endDate.query - End date for context window
 * @param {string} format.query - Output format
 * @return {object} 200 - Context window data
 * @return {Error} 400 - Memory not initialized
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.get('/memory/threads/:threadId/context-window', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const { startDate, endDate, format } = req.query;
    const memory = mastra.memory;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const thread = await memory.getThreadById({ threadId });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const result = await memory.getContextWindow({ threadId, startDate, endDate, format });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting context window from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error getting context window from memory' });
    return;
  }
});

/**
 * POST /memory/save-messages
 * @summary Save messages to memory
 * @tags Memory
 * @param {Message[]} request.body.required - Array of messages to save
 * @return {object} 200 - Save confirmation
 * @return {Error} 400 - Memory not initialized or validation error
 * @return {Error} 500 - Server error
 */
app.post('/memory/save-messages', async (req: Request, res: Response) => {
  try {
    const memory = mastra.memory;
    const messages = req.body;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const { ok, errorResponse } = await validateBody({ messages });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: { messages: 'Messages should be an array' } });
      return;
    }

    const processMessages = messages.map(message => {
      return {
        ...message,
        id: memory.generateId(),
        createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
      };
    });
    const result = await memory.saveMessages({ messages: processMessages });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error saving messages to memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error saving messages to memory' });
    return;
  }
});

/**
 * POST /memory/threads/{threadId}/tool-result
 * @summary Get tool execution result
 * @tags Memory
 * @param {string} threadId.path.required - Thread identifier
 * @param {object} request.body.required - Tool execution details
 * @param {string} request.body.toolName.required - Name of the tool
 * @param {object} request.body.toolArgs.required - Tool arguments
 * @return {object} 200 - Tool execution result
 * @return {Error} 400 - Memory not initialized or validation error
 * @return {Error} 404 - Thread not found
 * @return {Error} 500 - Server error
 */
app.post('/memory/threads/:threadId/tool-result', async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const memory = mastra.memory;
    const { toolName, toolArgs } = req.body;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const { ok, errorResponse } = await validateBody({ toolName, toolArgs });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    const thread = await memory.getThreadById({ threadId });

    if (!thread) {
      res.status(404).json({ error: 'Thread not found' });
      return;
    }

    const result = await memory.getToolResult({ threadId, toolName, toolArgs });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error getting tool result from memory', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error getting tool result from memory' });
    return;
  }
});

/**
 * POST /memory/validate-tool-call-args
 * @summary Validate tool call arguments
 * @tags Memory
 * @param {object} request.body.required - Validation request
 * @param {string} request.body.hashedArgs.required - Hashed tool arguments
 * @return {object} 200 - Validation result
 * @return {Error} 400 - Memory not initialized or validation error
 * @return {Error} 500 - Server error
 */
app.post('/memory/validate-tool-call-args', async (req: Request, res: Response) => {
  try {
    const memory = mastra.memory;
    const { hashedArgs } = req.body;

    if (!memory) {
      res.status(400).json({ error: 'Memory is not initialized' });
      return;
    }

    const { ok, errorResponse } = await validateBody({ hashedArgs });

    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    const result = await memory.validateToolCallArgs({ hashedArgs });
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error validating tool call args', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error validating tool call args' });
    return;
  }
});

/**
 * POST /syncs/{syncId}/execute
 * @summary Execute a sync operation
 * @tags Sync
 * @param {string} syncId.path.required - Sync identifier
 * @param {object} request.body.required - Sync parameters
 * @param {string} request.body.runId - Run identifier
 * @param {object} request.body.params - Sync parameters
 * @return {object} 200 - Sync execution result
 * @return {Error} 400 - Validation error
 * @return {Error} 500 - Server error
 */
app.post('/syncs/:syncId/execute', async (req: Request, res: Response) => {
  try {
    const syncId = req.params.syncId;
    const { runId, params } = req.body;

    const { ok, errorResponse } = await validateBody({ params });
    if (!ok) {
      res.status(400).json({ error: errorResponse });
      return;
    }

    const result = await mastra.sync(syncId, params, runId);
    res.json(result);
  } catch (error) {
    const apiError = error as ApiError;
    console.error('Error executing sync', apiError);
    res.status(apiError.status || 500).json({ error: apiError.message || 'Error executing sync' });
    return;
  }
});

export const handler = serverless(app);

app.listen(process.env.PORT || 4111, () => {
  console.log(`🦄Server running on port ${process.env.PORT || 4111}`);
  console.log(`📚 Open API documentation available at http://localhost:${process.env.PORT || 4111}/openapi.json`);
});