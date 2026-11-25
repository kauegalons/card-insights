/** Spec v1 §2: categories (two levels) and categorization rules (ADR 007). */
export interface Category {
  id: string;
  name: string;
  /** Set on a subcategory; absent on a top-level category. */
  parentId?: string;
  budgetGroup?: 'needs' | 'wants' | 'savings';
}

export interface Rule {
  id: string;
  match: 'contains' | 'regex';
  pattern: string;
  /** Subcategory id. */
  categoryId: string;
  priority: number;
  origin: 'default' | 'user';
}
