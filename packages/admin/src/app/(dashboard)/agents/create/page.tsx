import { Icon } from '@/app/components/icon';

export default function Page() {
  return (
    <section>
      <div className="flex h-[var(--top-bar-height)] w-full content-center items-center justify-between border-b-[0.1px] border-mastra-border-1 px-[1.31rem]">
        <div className="h-fit items-center gap-1.5 flex">
          <span className=" bg-mastra-bg-3 rounded h-7 w-7 grid place-items-center">
            <Icon name="agent" className="w-3 h-3" />
          </span>
          <h1 className="text-base">Create New Agent</h1>
        </div>
      </div>
      <section className="grid h-[calc(100%-1.24rem)] gap-x-[0.62rem] grid-cols-[60rem_0.5px_1fr]">
        <div className="flex gap-2 flex-col">
          <div className="bg-mastra-bg-3 p-2 rounded flex-1">
            The Name and Rag page
            <div className="border-t p-2 border-mastra-border-1">
              <p>Structured output</p>
            </div>
          </div>
          <div className="bg-mastra-bg-3 rounded flex-1">The tools page</div>
        </div>
        <div>🦄</div>

        <div className="bg-mastra-bg-3 rounded w-full">The preview page</div>
      </section>
    </section>
  );
}