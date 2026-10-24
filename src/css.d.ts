// Nur CSS statt `vite/client`: dessen `import.meta.env` gaelte sonst auch in server/ und core/, wo Node es nicht kennt.
declare module '*.css';
