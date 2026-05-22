const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'sympy_solver.py');

function findPython() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  return process.platform === 'win32' ? 'py' : 'python3';
}

function runSympy(payload) {
  return new Promise((resolve, reject) => {
    const python = findPython();
    const args =
      process.platform === 'win32' && python === 'py'
        ? ['-3', SCRIPT]
        : [SCRIPT];

    const proc = spawn(python, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Python not found (${python}). Install Python 3 and run: pip install sympy`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(stderr.trim() || `SymPy process exited with code ${code}`)
        );
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch {
        reject(new Error(`Invalid SymPy output: ${stdout.slice(0, 200)}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

module.exports = { runSympy };
