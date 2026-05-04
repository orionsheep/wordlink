import { NextRequest, NextResponse } from 'next/server';
import { getLibraryGroups } from '@/lib/data';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const pathParam = searchParams.get('path');
    const groupSizeParam = searchParams.get('groupSize');

    if (!pathParam) {
        return new NextResponse('Path parameter is required', { status: 400 });
    }

    const groupSize = groupSizeParam ? parseInt(groupSizeParam) : 100;
    const groups = await getLibraryGroups(pathParam, groupSize);
    return NextResponse.json(groups);
}
