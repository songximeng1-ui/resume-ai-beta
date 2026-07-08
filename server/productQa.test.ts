import { describe, expect, test } from 'vitest';

import { runV04InventoryProductQa, runV04ProductQa } from './productQa.ts';

describe('V0.4 product-level QA', () => {
  test('realistic JD sample stays aligned with the job-diagnosis agent workflow', () => {
    const result = runV04ProductQa();
    const serialized = JSON.stringify(result.report);

    expect(result.sample.resumeText).toContain('教育机构新媒体运营实习');
    expect(result.sample.jdText).toContain('用户运营实习生');
    expect(result.sample.confusion).toContain('不知道自己能投什么');
    expect(result.report.mode).toBe('jd');
    expect(result.report.jdFit?.matrix.length).toBeGreaterThanOrEqual(3);
    expect(result.report.interviews).toHaveLength(5);
    expect(result.report.actionPlan.plans.filter((item) => item.period === '7 天内')).toHaveLength(2);
    expect(result.quality.passed).toBe(true);
    expect(result.quality.blockers).toEqual([]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'collects resume, JD and confusion', passed: true }),
        expect.objectContaining({ name: 'binds report evidence to confirmed assets', passed: true }),
        expect.objectContaining({ name: 'keeps internal agent labels hidden', passed: true }),
        expect.objectContaining({ name: 'avoids fabrication and overpromising', passed: true })
      ])
    );
    expect(serialized).toContain('教育机构新媒体运营实习');
    expect(serialized).toContain('校园二手交易调研项目');
    expect(serialized).not.toMatch(/TAR|PART|PREP|HR 视角|为什么问|事实回忆维度/);
    expect(serialized).not.toMatch(/主导|独立负责|显著提升|保证 offer|保证通过/);
  });

  test('realistic no-JD sample stays focused on direction exploration instead of fake matching', () => {
    const result = runV04InventoryProductQa();
    const serialized = JSON.stringify(result.report);

    expect(result.sample.resumeText).toContain('教育机构新媒体运营实习');
    expect(result.sample.jdText).toBe('');
    expect(result.sample.confusion).toContain('没有明确 JD');
    expect(result.report.mode).toBe('inventory');
    expect(result.report.jdFit).toBeUndefined();
    expect(result.report.interviews).toBeUndefined();
    expect(result.report.directionOptions?.length).toBeGreaterThanOrEqual(2);
    expect(result.report.directionOptions?.length).toBeLessThanOrEqual(3);
    expect(result.report.directionOptions?.every((direction) => direction.searchableJobNames.length >= 3)).toBe(true);
    expect(result.report.directionOptions?.every((direction) => direction.sevenDayValidation.includes('7 天'))).toBe(true);
    expect(result.quality.passed).toBe(true);
    expect(result.quality.blockers).toEqual([]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'collects resume and confusion without JD', passed: true }),
        expect.objectContaining({ name: 'produces searchable direction options', passed: true }),
        expect.objectContaining({ name: 'does not fake JD matching', passed: true }),
        expect.objectContaining({ name: 'binds report evidence to confirmed assets', passed: true })
      ])
    );
    expect(serialized).toContain('可探索岗位方向');
    expect(serialized).not.toMatch(/岗位要求匹配分析|面试追问与回答准备|TAR|PART|PREP|HR 视角/);
    expect(serialized).not.toMatch(/主导|独立负责|显著提升|保证 offer|保证通过/);
  });
});
