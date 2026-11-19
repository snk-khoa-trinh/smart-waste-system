import { useNavigate, useSearch } from "@tanstack/react-router";
import { StationPicker } from "@/components/dashboard/station-picker";
import { Collections } from "@/components/dashboard/collections";
import { SortingActivity } from "@/components/dashboard/sorting-activity";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export function RecordsPage() {
  const search = useSearch({ from: "/records" });
  const navigate = useNavigate({ from: "/records" });
  return (
    <StationPicker
      title="Records"
      description="Review recent sorting outcomes and collection records for each bin."
    >
      {(station) => (
        <Tabs
          value={search.view}
          onValueChange={(view) => {
            if (view === "sorting" || view === "collections")
              void navigate({ search: { ...search, view } });
          }}
        >
          <TabsList aria-label="Record type">
            <TabsTrigger value="sorting">Sorting</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
          </TabsList>
          <TabsContent value="sorting">
            <SortingActivity station={station} expanded />
          </TabsContent>
          <TabsContent value="collections">
            <Collections station={station} />
          </TabsContent>
        </Tabs>
      )}
    </StationPicker>
  );
}
