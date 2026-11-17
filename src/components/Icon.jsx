import React from "react";
import {
  LayoutDashboard, ListChecks, ClipboardList, Printer, BarChart3, FileText, BookOpen, Tags,
  Users, Package, Settings, Bell, Save, User, TrendingUp, TrendingDown, Sun, Moon,
  Calculator as CalculatorIcon, LogOut, PlusCircle, UserPlus, ClipboardPlus, Trash2, Plus,
  ChevronLeft, ChevronRight, CheckCircle2, Circle, Zap, ArrowRight, ArrowLeft, Pencil,
  Plug, RefreshCw, ShoppingCart, MoreHorizontal, Info, CalendarClock, Link2, CalendarDays,
  ShoppingBag, FolderOpen, Sparkles, Smartphone, ChevronDown, Wallet, Briefcase, AlertTriangle, ShieldCheck, Search, Activity, Megaphone, MessageSquare, Send, Lock, Paperclip, Store, Layers, Wrench, Globe, LayoutGrid, Download, Upload, X, Check, FileSpreadsheet, RotateCcw, Eye, Copy, Filter, Ban, QrCode, Newspaper,
} from "lucide-react";

export const ICONS = {
  LayoutDashboard, ListChecks, ClipboardList, Printer, BarChart3, FileText, BookOpen, Tags,
  Users, Package, Settings, Bell, Save, User, TrendingUp, TrendingDown, Sun, Moon,
  Calculator: CalculatorIcon, LogOut, PlusCircle, UserPlus, ClipboardPlus, Trash2, Plus,
  ChevronLeft, ChevronRight, CheckCircle2, Circle, Zap, ArrowRight, ArrowLeft, Pencil,
  Plug, RefreshCw, ShoppingCart, MoreHorizontal, Info, CalendarClock, Link2, CalendarDays,
  ShoppingBag, FolderOpen, Sparkles, Smartphone, ChevronDown, Wallet, Briefcase, AlertTriangle, ShieldCheck, Search, Activity, Megaphone, MessageSquare, Send, Lock, Paperclip, Store, Layers, Wrench, Globe, LayoutGrid, Download, Upload, X, Check, FileSpreadsheet, RotateCcw, Eye, Copy, Filter, Ban, QrCode, Newspaper,
};

export default function Icon({ name, size = 18, style, ...rest }) {
  const Component = ICONS[name];
  if (!Component) return null;
  return <Component size={size} style={{ flexShrink: 0, ...style }} {...rest} />;
}
