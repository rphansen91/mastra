'use client';

import type { RefinedIntegrationApi } from '@arkw/core/dist/types';
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { createPortal } from 'react-dom';
import { Control, FieldErrors, useForm } from 'react-hook-form';
import { z, ZodSchema } from 'zod';

import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

import { toast } from '@/lib/toast';

import { RunApiOrEvent } from '@/app/(dashboard)/playground/components/run-button';
import { getWorkflowFormFieldMap } from '@/domains/workflows/components/utils/constants';
import BlockHeader from '@/domains/workflows/components/utils/render-header';
import ReferenceSelect from '@/domains/workflows/components/workflow-sidebar/config-forms/reference-select';
import { useFrameworkApi } from '@/domains/workflows/hooks/use-framework-api';
import { schemaToFormFieldRenderer } from '@/domains/workflows/schema';
import { customZodResolver } from '@/domains/workflows/utils';

import { useActionPlaygroundContext } from '../providers/action-playground-provider';
import { executeFrameworkApi } from '../server-actions/execute-framework-action';

function DynamicForm({
  showChangeButton,
  headerClassname,
  showActionButton = true,
}: {
  showChangeButton?: boolean;
  headerClassname?: string;
  showActionButton?: boolean;
}) {
  const { selectedAction, setSelectedAction, arkwReferenceId, setArkwReferenceId, setPayload } =
    useActionPlaygroundContext();
  const { frameworkApi, isLoading } = useFrameworkApi({
    apiType: selectedAction?.type!,
    integrationName: selectedAction?.integrationName!,
    referenceId: arkwReferenceId,
  });

  if (!selectedAction || !selectedAction?.schema) {
    return null;
  }

  const title = selectedAction.label;
  const icon = selectedAction.icon;
  const desc = selectedAction.description;

  return (
    <ScrollArea className="h-full w-full" viewportClassName="kepler-actions-form-scroll-area">
      <div className="flex flex-col h-full">
        <BlockHeader
          title={title}
          description={desc}
          icon={
            icon || {
              alt: 'dashboard icon',
              icon: 'dashboard',
            }
          }
          category={'action'}
          handleEditBlockType={() => {
            setSelectedAction(undefined);
            setPayload({});
            setArkwReferenceId('');
          }}
          showChangeButton={showChangeButton}
          classname={headerClassname}
        />
        <div className="mt-5 px-6">
          <Text weight="medium" className="text-arkw-el-3">
            Inputs
          </Text>
        </div>
        <section className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-3 px-6">
            <Label className="capitalize flex gap-1" htmlFor="arkwReferenceId" aria-required={true}>
              <span className="text-red-500">*</span>
              <Text variant="secondary" className="text-arkw-el-3" size="xs">
                Reference ID to use execute the API
              </Text>
            </Label>

            <ReferenceSelect
              selected={arkwReferenceId}
              onSelect={({ value }: { value: any }) => {
                setArkwReferenceId(value);
              }}
              integrationName={selectedAction?.integrationName}
            />
          </div>
          {isLoading ? (
            <div className="flex flex-col gap-5 px-6">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ) : (
            <InnerDynamicForm showActionButton={showActionButton} block={frameworkApi!} />
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function InnerDynamicForm<T extends ZodSchema>({
  block,
  showActionButton,
}: {
  block: RefinedIntegrationApi;
  showActionButton?: boolean;
}) {
  const {
    setPayload,
    arkwReferenceId,

    buttonContainer,
  } = useActionPlaygroundContext();

  const blockSchemaTypeName = (block?.zodSchema as any)?._def?.typeName;
  const discriminatedUnionSchemaOptions = (block?.schema as any)?._def?.options;
  const discriminatedUnionSchemaDiscriminator = (block?.zodSchema as any)?._def?.discriminator;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<z.infer<T>>({
    resolver:
      blockSchemaTypeName === 'ZodDiscriminatedUnion'
        ? customZodResolver(block?.schema as any, discriminatedUnionSchemaDiscriminator)
        : zodResolver(block?.schema as any),
    // defaultValues: {}
  });

  const formValues = watch();

  if (!block || !block?.schema) {
    return null;
  }

  const discriminatorValue = discriminatedUnionSchemaDiscriminator
    ? watch(discriminatedUnionSchemaDiscriminator)
    : undefined;

  const schema =
    blockSchemaTypeName === 'ZodDiscriminatedUnion'
      ? discriminatedUnionSchemaOptions?.find(
          (option: any) => option?.shape?.[discriminatedUnionSchemaDiscriminator]?._def?.value === discriminatorValue,
        ) || z.object({ [discriminatedUnionSchemaDiscriminator]: z.string() })
      : block?.schema;

  function handleFieldChange({ key, value }: { key: keyof z.infer<T>; value: any }) {
    if (key === discriminatedUnionSchemaDiscriminator) {
      setValue(key as any, value);
      setPayload({ ...formValues, [key]: value });
    } else {
      setValue(key as any, value);
      setPayload({ ...formValues, [key]: value });
    }
  }

  async function handleRunAction() {
    const parser = block?.schema;
    let values = formValues;

    try {
      if (parser) {
        values = (parser as ZodSchema).parse(formValues);
      }
      const res = await executeFrameworkApi({
        api: block?.type!,
        payload: { data: values, ctx: { referenceId: arkwReferenceId } },
        integrationName: block?.integrationName!,
      });
      console.log({ res });
      toast.success('Action executed successfully');
    } catch (error) {
      toast.error('Action execution failed');
      console.error({ error });
    }
  }

  //pass this into context
  //trigger, handleRunAction function

  return (
    <>
      <form onSubmit={handleSubmit(() => {})} className="flex flex-col gap-5 p-6 pb-0 h-full">
        {renderDynamicForm({
          schema,
          block,
          handleFieldChange,
          control,
          formValues,
          errors,
        })}
      </form>

      {createPortal(
        <RunApiOrEvent
          context="api"
          onClick={async () => {
            const isValid = await trigger();
            if (isValid) {
              await handleRunAction();
            }
          }}
        />,
        buttonContainer as Element,
      )}
    </>
  );
}

export default DynamicForm;

function renderDynamicForm({
  schema,
  block,
  handleFieldChange,
  control,
  formValues,
  errors,
  parentField,
}: {
  schema: ZodSchema;
  block: RefinedIntegrationApi;
  handleFieldChange: ({ key, value }: { key: any; value: any }) => void;
  control: Control<any, any>;
  formValues: any;
  parentField?: string;
  errors: FieldErrors<any>;
}) {
  return (
    <>
      {Object.entries(((schema as any) || {}).shape).map(([field, schema]) => {
        const currentField = parentField ? `${parentField}.${field}` : field;
        if (schema instanceof z.ZodDefault) return;
        if (schema instanceof z.ZodObject) {
          return (
            <React.Fragment key={currentField}>
              {renderDynamicForm({
                schema,
                block,
                handleFieldChange,
                control,
                formValues,
                errors,
                parentField: currentField,
              })}
            </React.Fragment>
          );
        }

        const fieldFromDescription = (schema as ZodSchema)?._def?.description?.split('::')[1];

        return (
          <div key={currentField} className="flex flex-col gap-1">
            {schemaToFormFieldRenderer({
              schemaField: currentField as string,
              schema: schema as any,
              schemaOptions: block.schemaOptions?.[currentField],
              onFieldChange: handleFieldChange,
              control,
              renderFieldMap: getWorkflowFormFieldMap({
                canUseVariables: false,
                fieldFromDescription,
              }),
              values: formValues,
              errors,
            })}
          </div>
        );
      })}
    </>
  );
}