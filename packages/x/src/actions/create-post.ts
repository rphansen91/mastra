import { DataLayer, IntegrationAction } from '@arkw/core';
import { z } from 'zod';

// @ts-ignore
import xIcon from '../assets/x.svg';
import { CREATE_POST_SCHEMA, CREATE_POST_OUTPUT_SCHEMA } from '../schemas';
import { MakeClient } from '../types';

export const CREATE_POST = ({
  name,
  makeClient,
}: {
  name: string;
  dataAccess: DataLayer;
  makeClient: MakeClient;
}): IntegrationAction<z.infer<typeof CREATE_POST_SCHEMA>, z.infer<typeof CREATE_POST_OUTPUT_SCHEMA>> => ({
  integrationName: name,
  executor: async ({ data, ctx: { referenceId } }) => {
    const client = await makeClient({ referenceId });

    const { post } = data;

    const createdPost = await client.createTweet(post);

    if (createdPost?.errors) {
      throw new Error('Error creating post');
    }

    const { text, id } = createdPost?.data || {};

    return {
      post: text,
      id,
    };
  },
  icon: {
    alt: 'X Icon',
    icon: xIcon,
  },
  type: 'CREATE_POST',
  schema: CREATE_POST_SCHEMA,
  description: 'Create an X post',
  label: 'Create Post',
  outputSchema: CREATE_POST_OUTPUT_SCHEMA,
});