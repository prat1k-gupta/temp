# Vercel Blob Setup Guide

This guide will help you set up Vercel Blob to replace the file system storage for flows data.

## Why Vercel Blob?

Vercel's serverless runtime has a **read-only file system**, which means you cannot write to files like `flows.json` during execution. Vercel Blob provides persistent object storage that works perfectly in serverless environments.

**Note:** Vercel KV was discontinued on June 9, 2025. Vercel Blob is the recommended replacement for file storage.

## Pricing

**Vercel Blob Free Tier (Hobby Plan):**
- ✅ **1 GB** of storage per month
- ✅ **10,000 simple operations** (reads) per month
- ✅ **2,000 advanced operations** (writes/uploads) per month
- ✅ **10 GB** of data transfer per month
- ✅ Perfect for development and small projects
- ✅ No credit card required

**Pro Plan:**
- 5 GB storage per month
- 100,000 simple operations per month
- 10,000 advanced operations per month
- 100 GB data transfer per month
- Additional usage billed per operation

## Setup Steps

### 1. Create a Vercel Blob Store

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to the **Storage** tab
4. Click **Create Database**
5. Select **Blob** (Object Storage)
6. Choose a name for your store (e.g., `magic-flow-blob`)
7. Select your region (choose closest to your users)
8. Click **Create**

### 2. Get Environment Variables

After creating the Blob store, Vercel will automatically provide environment variables:

- `BLOB_READ_WRITE_TOKEN` - Token for read/write operations (required)
- `BLOB_READ_ONLY_TOKEN` - Token for read-only operations (optional)

### 3. Add Environment Variables to Your Project

#### Option A: Via Vercel Dashboard (Recommended)

1. In your project dashboard, go to **Settings** → **Environment Variables**
2. The Blob token should already be added automatically as `BLOB_READ_WRITE_TOKEN`
3. If not, add it manually:
   - Key: `BLOB_READ_WRITE_TOKEN`
   - Value: (from your Blob store settings)

#### Option B: Via `.env.local` (For Local Development)

Create or update `.env.local` in your project root:

```bash
BLOB_READ_WRITE_TOKEN=your-blob-read-write-token
```

**Important:** Add `.env.local` to `.gitignore` to avoid committing secrets.

### 4. Install Dependencies

The `@vercel/blob` package is already installed. If you need to reinstall:

```bash
pnpm add @vercel/blob
```

### 5. Verify Setup

The code is already configured to use Vercel Blob. The API routes (`/app/api/flows/route.ts` and `/app/api/flows/[id]/route.ts`) now use Blob storage instead of the file system.

## How It Works

### Storage Structure

All flows are stored in a single blob file: `flows.json`

The data structure in Blob:
```json
{
  "flow-123": { /* flow data */ },
  "flow-456": { /* flow data */ }
}
```

### API Functions

The following utility functions are available in `/utils/blob-storage.ts`:

- `getAllFlowsFromBlob()` - Get all flows
- `getFlowFromBlob(flowId)` - Get a specific flow
- `saveFlowsToBlob(flows)` - Save all flows
- `saveFlowToBlob(flow)` - Save/update a single flow
- `deleteFlowFromBlob(flowId)` - Delete a flow

## Migration from File System

If you have existing data in `data/flows.json`, you can migrate it:

### Option 1: Manual Migration Script

Create a temporary script `scripts/migrate-to-blob.ts`:

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'
import { saveFlowsToBlob } from '../utils/blob-storage'

async function migrate() {
  try {
    // Read existing flows.json
    const filePath = join(process.cwd(), 'data', 'flows.json')
    const fileContents = readFileSync(filePath, 'utf8')
    const flows = JSON.parse(fileContents)
    
    // Save to Blob
    const saved = await saveFlowsToBlob(flows)
    
    if (saved) {
      console.log('✅ Migration successful!')
      console.log(`Migrated ${Object.keys(flows).length} flows`)
    } else {
      console.error('❌ Migration failed')
    }
  } catch (error) {
    console.error('Migration error:', error)
  }
}

migrate()
```

Run it once:
```bash
npx tsx scripts/migrate-to-blob.ts
```

Then delete the script after migration.

### Option 2: Let it migrate naturally

The first API call will create an empty Blob store, and users can recreate flows. Existing flows in `data/flows.json` will remain for reference but won't be used by the API.

## Testing

1. Deploy to Vercel or run locally with environment variables set
2. Test creating a flow via API:
   ```bash
   curl -X POST http://localhost:3001/api/flows \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Flow","platform":"web"}'
   ```
3. Verify it persists by fetching it back:
   ```bash
   curl http://localhost:3001/api/flows/flow-1234567890
   ```
4. Check Vercel Blob dashboard to see the stored file

## Troubleshooting

### Error: "BLOB_READ_WRITE_TOKEN is not defined"

**Solution:** Make sure environment variable is set:
- Check Vercel dashboard → Settings → Environment Variables
- For local dev, ensure `.env.local` exists with `BLOB_READ_WRITE_TOKEN`

### Error: "Blob not found" on first write

**Solution:** This is normal! The first write will create the blob. The error handling in `getAllFlowsFromBlob()` returns an empty object if the blob doesn't exist yet.

### Error: "Access denied" or "Unauthorized"

**Solution:**
- Verify you're using `BLOB_READ_WRITE_TOKEN` (not read-only token)
- Check that the token is correct in your environment variables
- Ensure the Blob store is active in Vercel dashboard

### Data Not Persisting

**Solution:**
- Check Blob dashboard to see if writes are happening
- Verify you're using `BLOB_READ_WRITE_TOKEN` (not read-only token)
- Check function logs in Vercel dashboard
- Ensure the blob file `flows.json` exists in your Blob store

## Local Development

For local development, you have two options:

1. **Use Vercel Blob** (Recommended)
   - Set up environment variables in `.env.local`
   - Works exactly like production
   - Requires a Blob store in your Vercel project

2. **Use File System Fallback** (Development only)
   - You can add a fallback in `blob-storage.ts` to use file system when Blob token is not available
   - This is only for local dev - won't work on Vercel
   - Example:
   ```typescript
   if (!process.env.BLOB_READ_WRITE_TOKEN) {
     // Fallback to file system for local dev
     return useFileSystem()
   }
   ```

## Performance Considerations

- **Reads:** Blob reads are fast and cached by CDN
- **Writes:** Each write operation updates the entire `flows.json` file
- **Optimization:** For high-traffic apps, consider:
  - Using Vercel Postgres for individual flow storage
  - Implementing caching for frequently accessed flows
  - Using a database for better query capabilities

## Next Steps

- ✅ Code is already updated to use Blob
- ⬜ Set up Blob store in Vercel dashboard
- ⬜ Add `BLOB_READ_WRITE_TOKEN` environment variable
- ⬜ Deploy and test
- ⬜ (Optional) Migrate existing data from `data/flows.json`

## Resources

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Blob SDK](https://www.npmjs.com/package/@vercel/blob)
- [Vercel Blob Pricing](https://vercel.com/docs/storage/vercel-blob/usage-and-pricing)
- [Vercel KV Deprecation Notice](https://vercel.com/changelog/vercel-kv)

