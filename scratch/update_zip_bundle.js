const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = '/Users/shijas/p2p father';
const zipPath = path.join(projectRoot, 'predict_export.zip');
const tempExtractDir = path.join(projectRoot, 'temp_zip_extract');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walk(filepath, callback);
        } else if (stat.isFile()) {
            callback(filepath);
        }
    });
}

async function main() {
    try {
        // 1. Clean and create temp directory
        if (fs.existsSync(tempExtractDir)) {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tempExtractDir, { recursive: true });

        // 2. Unzip predict_export.zip to temp folder
        console.log('Unzipping predict_export.zip...');
        execSync(`unzip -q "${zipPath}" -d "${tempExtractDir}"`, { cwd: projectRoot });

        // 3. Walk through the extracted files and overwrite them with current workspace versions if they exist
        walk(tempExtractDir, (extractedFilePath) => {
            const relPath = path.relative(tempExtractDir, extractedFilePath);
            let workspaceSourcePath = '';

            // Handle mappings for the developer bundle directory vs root directory
            if (relPath.startsWith('predict_developer_bundle/backend/')) {
                // e.g. predict_developer_bundle/backend/src/api/miniapp.ts -> src/api/miniapp.ts
                workspaceSourcePath = path.join(projectRoot, relPath.replace('predict_developer_bundle/backend/', ''));
            } else if (relPath.startsWith('predict_developer_bundle/frontend/')) {
                // e.g. predict_developer_bundle/frontend/miniapp/src/pages/Predict.tsx -> miniapp/src/pages/Predict.tsx
                workspaceSourcePath = path.join(projectRoot, relPath.replace('predict_developer_bundle/frontend/', ''));
            } else if (relPath.startsWith('predict_developer_bundle/README.md')) {
                workspaceSourcePath = path.join(projectRoot, 'predict_developer_bundle/README.md');
            } else {
                // Root files (e.g. src/services/polymarket.ts -> src/services/polymarket.ts)
                workspaceSourcePath = path.join(projectRoot, relPath);
            }

            if (fs.existsSync(workspaceSourcePath)) {
                // Overwrite the extracted file with the fresh workspace version
                fs.copyFileSync(workspaceSourcePath, extractedFilePath);
                console.log(`Updated in zip: ${relPath} <- ${path.relative(projectRoot, workspaceSourcePath)}`);
            } else {
                console.log(`Skipped (not found in workspace): ${relPath} (expected at ${path.relative(projectRoot, workspaceSourcePath)})`);
            }
        });

        // 4. Create new zip file
        const backupZipPath = path.join(projectRoot, 'predict_export_backup.zip');
        if (fs.existsSync(backupZipPath)) {
            fs.unlinkSync(backupZipPath);
        }
        if (fs.existsSync(zipPath)) {
            fs.renameSync(zipPath, backupZipPath);
        }

        console.log('Zipping files back to predict_export.zip...');
        // We use zip command on mac to zip all files under the directory recursively while preserving relative structure
        execSync(`zip -r -q "${zipPath}" .`, { cwd: tempExtractDir });
        console.log('Zip file updated successfully.');

        // 5. Cleanup temp directory
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        if (fs.existsSync(backupZipPath)) {
            fs.unlinkSync(backupZipPath);
        }
        console.log('Cleanup complete.');
    } catch (err) {
        console.error('Error updating zip bundle:', err);
        process.exit(1);
    }
}

main();
