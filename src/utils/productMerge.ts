import { Job, JobTypeDefinition } from '../types';
import { db } from '../services/dataService';

export interface ProductMergePreview {
    primaryName: string;
    secondaryName: string;
    jobsAffected: number;
    quoteLinesKept: number;
}

export interface ProductMergeResult extends ProductMergePreview {
    optionsMerged: boolean;
}

function unionStringLists(...lists: Array<string[] | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
        for (const raw of list || []) {
            const value = raw.trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);
            out.push(value);
        }
    }
    return out;
}

function mergeProductDefinitions(
    primary: JobTypeDefinition,
    secondary: JobTypeDefinition
): JobTypeDefinition {
    return {
        ...primary,
        name: primary.name,
        sizes: unionStringLists(primary.sizes, secondary.sizes),
        paperTypes: unionStringLists(primary.paperTypes, secondary.paperTypes),
        paperWeights: unionStringLists(primary.paperWeights, secondary.paperWeights),
        processings: unionStringLists(primary.processings, secondary.processings),
        processingsCover: unionStringLists(primary.processingsCover, secondary.processingsCover),
        processingsInner: unionStringLists(primary.processingsInner, secondary.processingsInner),
    };
}

function countJobsWithType(jobs: Job[], typeName: string): number {
    return jobs.filter(
        (job) =>
            job.type === typeName ||
            (job.subJobs || []).some((sj) => sj.type === typeName)
    ).length;
}

function countQuoteLinesWithType(typeName: string): number {
    let count = 0;
    for (const quote of db.getQuotes()) {
        for (const line of quote.lines || []) {
            if (line.productType === typeName) count += 1;
        }
        // 구형 견적: lines 없이 items 문자열만 있는 경우는 문서 문구라 건드리지 않음
    }
    return count;
}

function remapJobProductType(job: Job, from: string, to: string): Job | null {
    let changed = false;
    const type = job.type === from ? to : job.type;
    if (type !== job.type) changed = true;

    let subJobs = job.subJobs;
    if (subJobs?.length) {
        const next = subJobs.map((sj) => {
            if (sj.type !== from) return sj;
            changed = true;
            return { ...sj, type: to };
        });
        if (changed) subJobs = next;
    }

    return changed ? { ...job, type, subJobs } : null;
}

export function getProductMergePreview(
    primaryName: string,
    secondaryName: string
): ProductMergePreview {
    const jobs = db.getAllJobs();
    return {
        primaryName,
        secondaryName,
        jobsAffected: countJobsWithType(jobs, secondaryName),
        quoteLinesKept: countQuoteLinesWithType(secondaryName),
    };
}

/**
 * 사용자가 명시적으로 실행한 상품 합치기만 수행.
 * - 등록/저장 경로에서는 호출하지 않음 (어제처럼 이름 자동 합치기 금지)
 * - 작업 type / subJobs.type 만 primary로 이전
 * - 견적 productType 은 당시 문서 유지를 위해 변경하지 않음
 */
export async function mergeProducts(
    primaryName: string,
    secondaryName: string
): Promise<ProductMergeResult> {
    const primary = primaryName.trim();
    const secondary = secondaryName.trim();

    if (!primary || !secondary) {
        throw new Error('합칠 품목 2개를 선택해 주세요.');
    }
    if (primary === secondary) {
        throw new Error('같은 품목은 합칠 수 없습니다.');
    }

    const definitions = db.getProductDefinitions();
    const primaryDef = definitions.find((d) => d.name === primary);
    const secondaryDef = definitions.find((d) => d.name === secondary);

    if (!primaryDef || !secondaryDef) {
        throw new Error('선택한 품목을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.');
    }

    const preview = getProductMergePreview(primary, secondary);
    const mergedDef = mergeProductDefinitions(primaryDef, secondaryDef);
    const nextDefs = definitions
        .filter((d) => d.name !== secondary)
        .map((d) => (d.name === primary ? mergedDef : d));

    // 1) 마스터 옵션 합친 뒤 저장 (secondary 제거)
    await db.saveProductDefinitions(nextDefs);

    // 2) 작업만 이전 — 견적은 재출력 일치를 위해 미변경
    for (const job of db.getAllJobs()) {
        const remapped = remapJobProductType(job, secondary, primary);
        if (remapped) {
            await db.updateJob(remapped);
        }
    }

    return {
        ...preview,
        optionsMerged: true,
    };
}
