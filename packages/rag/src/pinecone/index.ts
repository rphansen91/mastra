import { Pinecone } from '@pinecone-database/pinecone';
import { MastraVector, QueryResult, IndexStats } from '@mastra/core';

export class PineconeVector extends MastraVector {
    private client: Pinecone;

    constructor(apiKey: string, environment: string) {
        super();

        const opts: { apiKey: string, controllerHostUrl?: string } = { apiKey }

        if (environment) {
            opts['controllerHostUrl'] = environment
        }

        this.client = new Pinecone(opts);
    }

    async upsert(
        indexName: string,
        vectors: number[][],
        metadata?: Record<string, any>[],
        ids?: string[]
    ): Promise<string[]> {
        const index = this.client.Index(indexName);

        // Generate IDs if not provided
        const vectorIds = ids || vectors.map(() => crypto.randomUUID());

        const records = vectors.map((vector, i) => ({
            id: vectorIds[i],
            values: vector,
            metadata: metadata?.[i] || {}
        }));

        // Pinecone has a limit of 100 vectors per upsert request
        const batchSize = 100;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            await index.upsert(batch);
        }

        return vectorIds;
    }

    async createIndex(
        indexName: string,
        dimension: number,
        metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine'
    ): Promise<void> {
        await this.client.createIndex({
            name: indexName,
            dimension: dimension,
            metric: metric,
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-west-2'
                }
            }
        });
    }

    async query(
        indexName: string,
        queryVector: number[],
        topK: number = 10,
        filter?: Record<string, any>
    ): Promise<QueryResult[]> {
        const index = this.client.Index(indexName);

        const results = await index.query({
            vector: queryVector,
            topK,
            filter,
            includeMetadata: true
        });

        return results.matches.map(match => ({
            id: match.id,
            score: match.score || 0,
            metadata: match.metadata as Record<string, any>
        }));
    }

    async listIndexes(): Promise<string[]> {
        const indexesResult = await this.client.listIndexes();
        return indexesResult?.indexes?.map(index => index.name) || [];
    }

    async describeIndex(indexName: string): Promise<IndexStats> {
        const index = this.client.Index(indexName);
        const stats = await index.describeIndexStats();
        const description = await this.client.describeIndex(indexName);

        return {
            dimension: description.dimension,
            count: stats.totalRecordCount,
            metric: description.metric as 'cosine' | 'euclidean' | 'dotproduct'
        };
    }

    async deleteIndex(indexName: string): Promise<void> {
        try {
            await this.client.deleteIndex(indexName);
        } catch (error: any) {
            throw new Error(`Failed to delete Pinecone index: ${error.message}`);
        }
    }
}