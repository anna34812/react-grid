# react-data-grid

This project can be consumed directly from a Git repository without publishing to npm.

## Install from Git repository

Add the dependency to your consumer project's `package.json`:

```json
{
  "dependencies": {
    "my-lib": "git+https://github.com/company/my-lib.git#v1.0.0"
  }
}
```

Use one of these refs:

- `#v1.0.0`: install a tag (recommended for stable release)
- `#package`: install a branch
- `#<commit-sha>`: install a specific commit

Example for this repository:

```json
{
  "dependencies": {
    "react-data-grid": "git+https://github.com/<org>/<repo>.git#package"
  }
}
```

Then run:

```bash
npm install
```

## Package branch workflow

Use the `package` branch as the install target for internal consumers.

1. Work and test changes in this repository.
2. Merge or commit library-ready changes into `package`.
3. (Optional but recommended) Create a tag such as `v1.0.1` on `package`.
4. In consumer projects, install using one of:
   - branch: `git+https://github.com/<org>/<repo>.git#package`
   - tag: `git+https://github.com/<org>/<repo>.git#v1.0.1`

For production-like stability, prefer tag refs over branch refs.

## Exports

The package root exports:

- `IXGrid` (default integrated grid component)
- `DataGrid`
- `TreeDataGrid`
- `DEFAULT_ROW_SELECTION`
- `COLUMN_SIZE_MODE`
