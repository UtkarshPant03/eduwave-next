import Link from "next/link";
import { Search } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import type { BankFilters } from "@/lib/data/question-bank";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "@/lib/questions";

/** Filters for a question bank list: a plain GET form, so filtered views can be bookmarked. */
export function BankFilterForm({
  action,
  categories,
  tags,
  filters,
}: {
  action: string;
  categories: { id: string; name: string }[];
  tags: string[];
  filters: BankFilters;
}) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-2xl border border-border p-3">
      <label className="grid flex-1 gap-1 text-xs font-medium">
        Search
        <Input name="q" defaultValue={filters.q ?? ""} maxLength={100} placeholder="Words in the question" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Category
        <Select name="category" defaultValue={filters.category ?? ""}>
          <option value="">All</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Type
        <Select name="type" defaultValue={filters.type ?? ""}>
          <option value="">All</option>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
        </Select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Tag
        <Select name="tag" defaultValue={filters.tag ?? ""}>
          <option value="">All</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </label>
      <Button type="submit" variant="secondary"><Search className="size-4" /> Filter</Button>
      {(filters.q || filters.category || filters.type || filters.tag) && <Link href={action} className="self-center text-sm text-accent hover:underline">Clear</Link>}
    </form>
  );
}
