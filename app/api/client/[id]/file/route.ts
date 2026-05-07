import { NextRequest, NextResponse } from 'next/server';

const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set');
  return key;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const columnId = (formData.get('columnId') as string) || 'files';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Build multipart form for Monday.com file upload API
    const mondayForm = new FormData();
    mondayForm.append(
      'query',
      `mutation ($file: File!) {
        add_file_to_column(item_id: ${id}, column_id: "${columnId}", file: $file) {
          id
          url
          public_url
          name
        }
      }`
    );
    mondayForm.append('variables[file]', file, file.name);

    const res = await fetch(MONDAY_FILE_URL, {
      method: 'POST',
      headers: { Authorization: getApiKey() },
      body: mondayForm,
    });

    const data = await res.json();

    if (data.errors) {
      console.error('Monday file upload error:', data.errors);
      return NextResponse.json({ error: data.errors[0]?.message }, { status: 500 });
    }

    const asset = data.data?.add_file_to_column;
    return NextResponse.json({
      ok: true,
      assetId: String(asset?.id || ''),
      url: asset?.public_url || asset?.url || '',
      name: asset?.name || file.name,
    });
  } catch (error) {
    console.error('File upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
