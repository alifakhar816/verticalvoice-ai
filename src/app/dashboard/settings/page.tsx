"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and platform preferences.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>
                Update your organization details and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="Your organization"
                  defaultValue=""
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  placeholder="UTC"
                  defaultValue="UTC"
                  disabled
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive email notifications for important events.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
              <CardDescription>
                Manage your subscription plan and payment methods.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Free Plan</p>
                  <p className="text-sm text-muted-foreground">
                    Limited to 50 calls per month
                  </p>
                </div>
                <Button variant="outline">Upgrade</Button>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-medium">Payment Method</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  No payment method on file.
                </p>
                <Button variant="outline" className="mt-2">
                  Add Payment Method
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage who has access to your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">You</p>
                  <p className="text-sm text-muted-foreground">Owner</p>
                </div>
                <span className="text-sm text-muted-foreground">Admin</span>
              </div>
              <Button variant="outline">Invite Team Member</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                Manage security settings and API keys.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Password</h4>
                <p className="text-sm text-muted-foreground">
                  Change your account password.
                </p>
                <Button variant="outline">Change Password</Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Two-Factor Authentication</h4>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account.
                </p>
                <Button variant="outline">Enable 2FA</Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">API Keys</h4>
                <p className="text-sm text-muted-foreground">
                  Manage API keys for programmatic access.
                </p>
                <Button variant="outline">Manage API Keys</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
