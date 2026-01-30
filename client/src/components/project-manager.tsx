import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { Project } from '@chat-template/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

const EMOJI_OPTIONS = ['📁', '💼', '🚀', '💡', '🎯', '📊', '🔬', '🎨', '📚', '⚡'];
const COLOR_OPTIONS = [
  '#FF5733', // Red
  '#FFC300', // Yellow
  '#DAF7A6', // Green
  '#33FF57', // Light Green
  '#33D9FF', // Cyan
  '#3366FF', // Blue
  '#8B33FF', // Purple
  '#FF33F6', // Pink
  '#FF3366', // Rose
  '#6B7280', // Gray
];

interface ProjectManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSuccess?: () => void;
}

export function ProjectManagerDialog({
  open,
  onOpenChange,
  project,
  onSuccess,
}: ProjectManagerDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0]);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setColor(project.color || COLOR_OPTIONS[0]);
      setIcon(project.icon || EMOJI_OPTIONS[0]);
      setIsActive(project.isActive === 'true');
    } else {
      setName('');
      setDescription('');
      setColor(COLOR_OPTIONS[0]);
      setIcon(EMOJI_OPTIONS[0]);
      setIsActive(true);
    }
  }, [project, open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const url = project
        ? `/api/projects/${project.id}`
        : '/api/projects';

      const method = project ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          icon,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save project');
      }

      toast.success(project ? 'Project updated' : 'Project created');
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error('Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {project ? 'Edit Project' : 'Create New Project'}
          </DialogTitle>
          <DialogDescription>
            {project
              ? 'Update your project details'
              : 'Create a project to organize your chats and files'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Project Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Research Project"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>

          {/* Icon Selection */}
          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`flex h-10 w-10 items-center justify-center rounded-md border-2 text-xl transition-colors ${
                    icon === emoji
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((colorOption) => (
                <button
                  key={colorOption}
                  type="button"
                  onClick={() => setColor(colorOption)}
                  className={`h-8 w-8 rounded-md border-2 transition-all ${
                    color === colorOption
                      ? 'scale-110 border-primary shadow-md'
                      : 'border-border hover:scale-105'
                  }`}
                  style={{ backgroundColor: colorOption }}
                  aria-label={`Select color ${colorOption}`}
                />
              ))}
            </div>
          </div>

          {/* Active Status (only show for existing projects) */}
          {project && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active Project</Label>
                <p className="text-muted-foreground text-sm">
                  Inactive projects are hidden from the main list
                </p>
              </div>
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : project
              ? 'Update Project'
              : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}