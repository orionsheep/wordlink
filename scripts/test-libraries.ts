import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import { getLibraryGroups, getLibraryList, getLibraryWords, parseLibraryFileContent } from '../src/lib/data';

const libraries = [
    { file: 'GRE.csv', count: 1512, first: 'abandon', last: 'wrongheaded' },
    { file: 'EAP/1-第一学期.csv', count: 969, first: 'academic' },
    { file: 'EAP/2-第二学期.csv', count: 509, first: 'access' },
];

async function main() {
    const root = await getLibraryList();
    assert(root.some(item => item.path === 'GRE.csv' && item.type === 'file'));
    assert(root.some(item => item.path === 'EAP' && item.type === 'directory'));
    assert.deepEqual((await getLibraryList('EAP')).map(item => item.path), libraries.slice(1).map(item => item.file));

    for (const { file, count, first, last } of libraries) {
        const content = await fs.readFile(path.join('data/word_library', file), 'utf8');
        const csv = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
        assert.deepEqual(csv.errors, [], `${file}: invalid CSV`);
        assert.deepEqual(csv.meta.fields, ['序号', '单词', '释义']);
        assert.equal(csv.data.length, count);
        csv.data.forEach((row, index) => {
            assert.equal(row['序号'], String(index + 1));
            assert(row['释义']?.trim(), `${file}: missing definition`);
        });
        const expected = csv.data.map(row => row['单词']);
        const words = await getLibraryWords(file);
        assert.deepEqual(words, expected, `${file}: loader must not skip or alter terms`);
        assert.deepEqual(parseLibraryFileContent('\uFEFF' + content), expected);
        assert.equal(new Set(words.map(word => word.toLowerCase())).size, count);
        assert.equal(words[0], first);
        if (last) assert.equal(words.at(-1), last);

        const groups = await getLibraryGroups(file, 100);
        assert.equal(groups.length, 1 + Math.ceil(count / 100));
        assert.equal(groups[0].index, -1);
        assert.equal(groups[0].end, count);
        assert.equal(groups.slice(1).reduce((total, group) => total + group.end - group.start + 1, 0), count);
        console.log(`${file}: ${count} terms, directory, parsing and groups OK`);
    }

    const semesterTwo = await getLibraryWords(libraries[2].file);
    assert(semesterTwo.includes('pledge'));
    assert(semesterTwo.includes('refrain from'));
    const gre = await getLibraryWords('GRE.csv');
    assert(gre.includes('cliche') && gre.includes('naive'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
