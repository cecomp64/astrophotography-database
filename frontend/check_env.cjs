const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log("=== Environment Pre-flight Check ===");
console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`CWD: ${process.cwd()}`);

const checkCommand = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: 'utf8' });
    if (result.error) {
        return { success: false, error: result.error.message };
    }
    return { success: true, stdout: result.stdout.trim() };
};

// 1. Check Python accessibility
const pyCmd = os.platform() === 'win32' ? 'python' : 'python3';
const pyCheck = checkCommand(pyCmd, ['--version']);
console.log(`Python (${pyCmd}): ${pyCheck.success ? pyCheck.stdout : "NOT FOUND: " + pyCheck.error}`);

// 2. Check Backend Directory
const backendPath = path.join(process.cwd(), 'backend');
if (fs.existsSync(backendPath)) {
    console.log(`Backend Dir: Found at ${backendPath}`);
    const mainFile = path.join(backendPath, 'main.py');
    console.log(`main.py: ${fs.existsSync(mainFile) ? "Found" : "MISSING"}`);
} else {
    console.log(`Backend Dir: MISSING at ${backendPath}`);
}

// 3. Check for the common "Error -8" culprit: Is the path a directory?
const testPath = path.join(process.cwd(), 'backend', 'dist', 'api'); // Change to your build path
if (fs.existsSync(testPath)) {
    const stats = fs.lstatSync(testPath);
    console.log(`Build Path Type: ${stats.isDirectory() ? "DIRECTORY (Will cause Error -8 if spawned)" : "FILE"}`);
}

console.log("====================================");