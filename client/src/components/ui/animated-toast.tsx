import { motion, AnimatePresence } from "framer-motion";
import { Toast, ToastProps } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { AlertCircle, XCircle, CheckCircle } from "lucide-react";
import { VariantProps } from "class-variance-authority";

const variants = {
  initial: { 
    opacity: 0, 
    y: 50,
    scale: 0.3,
    rotate: -10
  },
  animate: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.4,
      type: "spring",
      bounce: 0.5
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.5,
    y: -20,
    rotate: 10,
    transition: {
      duration: 0.3
    }
  }
};

const iconVariants = {
  initial: { scale: 0 },
  animate: { 
    scale: 1,
    transition: {
      delay: 0.2,
      type: "spring",
      bounce: 0.6
    }
  }
};

type AnimatedToastProps = Omit<ToastProps, "variant"> & {
  variant?: "default" | "destructive" | "success";
};

export function AnimatedToast({ className, variant = "default", ...props }: AnimatedToastProps) {
  const Icon = variant === "destructive" ? XCircle :
               variant === "success" ? CheckCircle :
               AlertCircle;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
    >
      <Toast
        className={cn(
          "flex items-center gap-2",
          variant === "destructive" && "bg-destructive text-destructive-foreground",
          variant === "success" && "bg-green-600 text-white dark:bg-green-500",
          className
        )}
        {...props}
      >
        <motion.div
          variants={iconVariants}
          className="flex-shrink-0"
        >
          <Icon className="h-5 w-5" />
        </motion.div>
        {props.children}
      </Toast>
    </motion.div>
  );
}