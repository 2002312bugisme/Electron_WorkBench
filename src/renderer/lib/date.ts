export const localDay = (value: Date | string = new Date()) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const monthKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
export const shortDate = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)) : '未设置';
export const datetimeInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
