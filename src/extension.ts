import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as https from 'https';
import { workspace, ExtensionContext, window, ProgressLocation, Uri } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient;

// Optional: Define extension configuration keys
const CONFIG_PREFIX = 'gock3';
const CONFIG_LSP_EXECUTABLE_PATH = `${CONFIG_PREFIX}.lspExecutablePath`;

export function activate(context: ExtensionContext) {
	const platform = os.platform();
	let downloadUrl = '';
	let fileName = '';

	// Determine the correct binary name and download URL based on the platform
	switch (platform) {
		case 'win32':
			fileName = 'gock3-lsp-windows.exe';
			downloadUrl = 'https://github.com/unLomTrois/gock3-lsp/releases/latest/download/gock3-lsp-windows.exe';
			break;
		case 'darwin':
			fileName = 'gock3-lsp-macos';
			downloadUrl = 'https://github.com/unLomTrois/gock3-lsp/releases/latest/download/gock3-lsp-macos';
			break;
		case 'linux':
			fileName = 'gock3-lsp-linux';
			downloadUrl = 'https://github.com/unLomTrois/gock3-lsp/releases/latest/download/gock3-lsp-linux';
			break;
		default:
			window.showErrorMessage(`Unsupported platform: ${platform}`);
			return;
	}

	// Define the path where the server executable will be stored using globalStorageUri
	const serverPath = path.join(context.globalStorageUri.fsPath, fileName);

	// Ensure the global storage directory exists
	if (!fs.existsSync(context.globalStorageUri.fsPath)) {
		fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
	}

	const downloadServer = async (): Promise<void> => {
		return new Promise((resolve, reject) => {
			https.get(downloadUrl, (response) => {
				if (response.statusCode !== 200) {
					reject(new Error(`Failed to download server: ${response.statusCode}`));
					return;
				}

				const data: Uint8Array[] = [];
				response.on('data', (chunk) => {
					data.push(chunk);
				});

				response.on('end', async () => {
					const serverUri = Uri.file(serverPath);
					const fileData = Buffer.concat(data);
					try {
						await workspace.fs.writeFile(serverUri, fileData);
						// Set executable permissions if needed
						if (platform !== 'win32') {
							await fs.promises.chmod(serverUri.fsPath, 0o755);
						}
						resolve();
					} catch (writeErr) {
						reject(writeErr);
					}
				});
			}).on('error', (err) => {
				reject(err);
			});
		});
	};

	/**
	 * Function to ensure the server executable exists.
	 * Downloads the server if it does not exist.
	 */
	const ensureServerExecutable = async (): Promise<void> => {
		if (!fs.existsSync(serverPath)) {
			await window.withProgress({
				location: ProgressLocation.Notification,
				title: 'GOCK3-LSP server not found. Downloading...',
				cancellable: false
			}, async (progress) => {
				try {
					await downloadServer();
					window.showInformationMessage('GOCK3-LSP server downloaded successfully.');
				} catch (error: any) {
					window.showErrorMessage(`Failed to download GOCK3-LSP server: ${error.message}`);
					throw error; // Re-throw to prevent starting the client
				}
			});
		} else {
			// Optional: Implement version checks to verify if the existing server is up-to-date
			// This requires the server to support a version command, which isn't implemented here
		}

		// Ensure the server executable has execute permissions on Unix-based systems
		if (platform !== 'win32') {
			fs.chmodSync(serverPath, 0o755);
		}
	};

	/**
	 * Main activation function for the language client.
	 * Ensures the server is available and starts the client.
	 */
	const activateClient = async () => {
		try {
			await ensureServerExecutable();
		} catch {
			// If the server cannot be downloaded, do not proceed
			return;
		}

		// Define server options
		const serverOptions: ServerOptions = {
			run: { command: serverPath, args: [] },
			debug: { command: serverPath, args: ['--debug'] }
		};

		// Define client options
		const clientOptions: LanguageClientOptions = {
			// Register the server for PDXScript documents
			documentSelector: [{ scheme: 'file', language: 'plaintext' }],
			synchronize: {
				// Notify the server about changes to PDXScript files in the workspace
				fileEvents: workspace.createFileSystemWatcher('**/*.txt') // Adjust the pattern if PDXScript uses different extensions
			}
		};

		// Create the language client
		client = new LanguageClient(
			'gock3LanguageServer',
			'GOCK3 Language Server',
			serverOptions,
			clientOptions
		);

		// Start the client, which will also launch the server
		client.start();
	};

	
    activateClient();
	
	// // Optional: Register a command to manually update the LSP server
	// const updateServerCommand = 'gock3-lsp.updateServer';
	// const disposable = workspace.onDidOpenTextDocument(() => {
	// 	// You can implement logic to check for updates here
	// 	// For simplicity, we'll skip it in this example
	// });

	// context.subscriptions.push(disposable);
}

/**
 * Deactivation function to stop the language client when the extension is deactivated.
 */
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
