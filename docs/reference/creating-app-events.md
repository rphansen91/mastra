## Creating app (custom) events

Mastra allows your app to define its own custom events, which can be used to trigger workflows, or which you can listen for in your own code.

Custom events are defined in the `mastra.config.ts` file, and are specified in the format:

`<app>.<entity>/<event>`

For example, `myApp.user/created` or `myApp.user/updated`.