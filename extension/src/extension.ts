import * as vscode from 'vscode';
import { InflateApi, activate as activateInflate, deactivateHost } from './activation';

export type { InflateApi };

let currentApi: InflateApi | undefined;

export function activate(context: vscode.ExtensionContext): InflateApi {
  currentApi = activateInflate(context);
  return currentApi;
}

export function deactivate(): Thenable<void> | undefined {
  if (!currentApi) return undefined;
  const { hostManager } = currentApi;
  currentApi = undefined;
  return deactivateHost(hostManager);
}
