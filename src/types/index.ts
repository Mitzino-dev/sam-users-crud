export interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  age: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  age?: number | null;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  age?: number | null;
}

export type UserSortField = 'createdAt' | 'updatedAt' | 'firstName' | 'lastName' | 'email' | 'age';

export type SortOrder = 'ASC' | 'DESC';

export interface ListUsersQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy: UserSortField;
  sortOrder: SortOrder;
}

export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  age: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}